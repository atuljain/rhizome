import xlrd, pandas, pprint as pp

from django.core.exceptions import ObjectDoesNotExist
from pandas.io.excel import read_excel

from datapoints.models import Source
from source_data.models import *


class PreIngest(object):

    def __init__(self,file_path,document_id):
        self.file_path = file_path
        self.document_id = document_id

        self.df, self.mappings = self.main(file_path, document_id)


    def main(self,file_path, document_id):
        ''' in this method we create or find the source metadata and return the
        values as a dictionary.'''

        wb = xlrd.open_workbook(file_path)

        for sheet in wb.sheets():

            if sheet.nrows == 0:
                pass
            else:
                mappings = self.pre_process_sheet(file_path,sheet.name,document_id)
                return mappings

        return df, mappings


    def pre_process_sheet(self,file_path,sheet_name,document_id):

        sheet_df = read_excel(file_path,sheet_name)
        cols = [col.lower() for col in sheet_df]


        all_meta_mappings = {}
        source_id = Source.objects.get(source_name ='Spreadsheet Upload').id

        all_meta_mappings['campaigns'] = self.map_campaigns(sheet_df,source_id)
        all_meta_mappings['indicators'] = self.map_indicators(sheet_df,source_id)
        all_meta_mappings['regions'] = self.map_regions(sheet_df,source_id)

        return sheet_df,all_meta_mappings

    def map_indicators(self,sheet_df,source_id):
        indicator_mapping = {}
        cols = [col.lower() for col in sheet_df]

        for col_name in cols:

            source_indicator, created = SourceIndicator.objects.get_or_create(
                source_id = source_id,
                indicator_string = col_name
            )

            try:
                indicator_id = IndicatorMap.objects.get(source_indicator_id = \
                    source_indicator.id).master_indicator_id

                indicator_mapping[col_name] = indicator_id
            except ObjectDoesNotExist:
                pass

        return indicator_mapping


    def map_campaigns(self,sheet_df,source_id):

        ## CAMPAIGN MAPPING ##
        campaign_mapping = {}
        campaigns = sheet_df.groupby('DateSoc')

        for campaign in campaigns:


            source_campaign, created = SourceCampaign.objects.get_or_create(
                source_id = source_id,
                campaign_string = campaign[0]
            )
            try:
                campaign_id = CampaignMap.objects.get(source_campaign_id = \
                    source_campaign.id).master_campaign_id

                campaign_mapping[str(campaign[0])] = campaign_id
            except ObjectDoesNotExist:
                pass

        return campaign_mapping

    def map_regions(self,df,source_id):
        ## REGION MAPPING ##
        region_mapping = {}

        df['region_string']  = df['Lga'] + '-' + df['State'] + '-' + \
            df['Ward'] + '-' + df['Settlement'].apply(str)

        regions = df.groupby('region_string')

        for region in regions:

            source_region_id, created = SourceRegion.objects.get_or_create(
                source_id = source_id,
                region_string = region[0]
            )

            try:
                region_id = RegionMap.objects.get(source_region_id = \
                    source_region_id.id).master_region_id
                region_mapping[region[0]] = region_id
            except ObjectDoesNotExist:
                pass

        return region_mapping
