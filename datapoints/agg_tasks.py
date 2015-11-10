import traceback
import json
from django.conf import settings

import pandas as pd
from pandas import DataFrame, read_sql
from pandas.tools.pivot import pivot_table
from pprint import pprint

from django.contrib.auth.models import User
from datapoints.models import *
from source_data.models import SourceObjectMap

class AggRefresh(object):
    '''
    Any time a user wants to refresh the cache, that is make any changes in the
    datapoint table avalaible to the API and the platform as a whole, the
    AggRefresh object is instatiated.  The flow of data is as follows:
        - Create a row in the ETL Job table.  This record will track the
          time each tasks takes, and in addition this ID is used as a key
          in the datapoints table so we can see when and why the cache was
          updated for this datapoint.
        - If the datapoint_id list is empty get the default (limit to 1000)
          list of datapoint_ids to process.
        - Find the indicator_ids (both computed and raw) that need to be
          processed.
        - Executes stored pSQL stored procedures to first aggregate, then
          calculate information.
    '''


    def __init__(self,campaign_id=None):
        '''
        If there is a job running, return to with a status code of
        "cache_running".

        If passed an explicit list of datapoints ids, then we process those
        other wise the datapoint IDs to process are handled in the set_up()
        method.

        By initializing this class we run the set_up() method followed my the
        main method. We capture and store any errors returned in the etljob
        table as well as the start / end time.
        '''

        self.dp_columns =['indicator_id','campaign_id', 'location_id',\
            'value','cache_job_id']

        self.dwc_batch, self.dwc_tuple_dict = [],{}

        if CacheJob.objects.filter(date_completed=None):
            return

        self.campaign_id = campaign_id

        if self.campaign_id is None:

            try:
                self.campaign_id = DataPoint.objects.filter(cache_job_id=-1)[0]\
                    .campaign_id
            except IndexError:
                return 'NOTHING_TO_PROCESS'


        self.cache_job = CacheJob.objects.create(
            is_error = False,
            response_msg = 'PENDING'
        )

        response_msg = self.main()

        if response_msg == 'ERROR':
            self.cache_job.response_msg = str(self.err)[:254]
            self.is_error = True
            return

        ## update the datapoint table with this cache_job_id
        DataPoint.objects.filter(campaign_id = self.campaign_id)\
            .update(cache_job_id = self.cache_job.id)

        ## mark job as completed and save
        self.cache_job.date_completed = datetime.now()
        self.cache_job.response_msg = response_msg
        self.cache_job.save()


    def main(self):
        '''
        Blindly catch any erros from the two aggregation functions.
        '''

        # try:
        self.agg_datapoints()
        self.calc_datapoints()
        # except Exception as err:
        #     self.err = traceback.format_exc()
        #     return 'ERROR'

        return 'SUCCESS'


    def agg_datapoints(self):
        '''
        Regional Aggregation based on the adjacency list built on top of the
        parent_location_id column.

        Data stored in the DataPoint table for a location with the same
        indicator, campaign will always override the aggregated values.

        Here, we create a tuple_dict in which the unique key of (locaiton,
        indicator, campaign) represents the key, and the cooresponding value
        is the value.  This way we add to the dict the aggregated values, then
        iterrate through the raw values, adding or updating the data in the
        tuple dict before bulk inserting the data.

        The tuple looks like:  {(1, 201, 164): 12, (2, 101, 168): .24}
        '''

        agg_dp_batch, tuple_dict = [],{}
        location_tree_columns = ['location_id','parent_location_id']


        dp_df = DataFrame(list(DataPoint.objects\
            .filter(campaign_id = self.campaign_id)\
            .values_list(*self.dp_columns)),columns=self.dp_columns)

        ## represents the location heirarchy as a cache from the location table
        location_tree_df = DataFrame(list(LocationTree.objects\
            .filter(location_id__in=list(dp_df['location_id'].unique()))
            .values_list(*location_tree_columns)),columns=location_tree_columns)

        ## join the location tree to the datapoints and group by parent location
        grouped_df = DataFrame(dp_df.merge(location_tree_df)\
            .groupby(['parent_location_id', 'indicator_id','campaign_id'])\
            ['value'].sum())

        ## add aggregate values to the tuple dict ##
        for ix, dp in grouped_df.iterrows():
            tuple_dict[ix] = dp.value

        ## now add the raw data to the dict ( overriding agregate if exists )
        for ix, dp in dp_df.iterrows():
            tuple_dict[(dp.location_id, dp.indicator_id, dp.campaign_id)] \
                = dp.value

        ## now prep the batch for the bulk insert ##
        for dp_unique_key, value in tuple_dict.iteritems():
            dp_dict =  dict(zip(('location_id','indicator_id','campaign_id')\
                ,dp_unique_key))

            dp_dict['value'] = value
            dp_dict['cache_job_id'] = self.cache_job.id

            agg_dp_batch.append(AggDataPoint(**dp_dict))

        AggDataPoint.objects.filter(campaign_id = self.campaign_id).delete()
        AggDataPoint.objects.bulk_create(agg_dp_batch)

    def calc_datapoints(self):
        '''
        When the agg_datapoint method runs, it will leave the agg_datapoint table
        in a state that all of the rows that were altered, and need to be cached
        thats is the ``calc_refreshed`` column will = 'f' for all of the rows
        that this task effected.

        To find out more about how calculation works, take a look at the
        fn_calc_datapoint stored procedures

        '''

        ## the order of these calculations defines their priority, meaning
        ## since raw data is the last calculation, this will override all else
        self.sum_of_parts()
        # self.part_over_whole()
        self.part_of_difference()
        self.raw_data()

        self.upsert_computed()

        return []

    def build_calc_df(self,calc_list):

        calc_df = DataFrame(list(CalculatedIndicatorComponent.objects\
            .filter(calculation__in= calc_list)\
            .values_list('indicator_id','indicator_component_id','calculation'))\
            ,columns=['calc_indicator_id','indicator_component_id','calc'])

        return calc_df

    def build_dp_df(self,indicator_id_list):

        dp_df = DataFrame(list(DataPoint.objects.all()\
            .filter(indicator_id__in = indicator_id_list\
                .unique(),campaign_id = self.campaign_id)\
            .values_list(*self.dp_columns)),columns=self.dp_columns)

        return dp_df

    def build_calc_df(self,calc_list):

        calc_df = DataFrame(list(CalculatedIndicatorComponent.objects\
            .filter(calculation__in= calc_list)\
            .values_list('indicator_id','indicator_component_id','calculation'))\
                ,columns=['calc_indicator_id','indicator_component_id','calc'])

        return calc_df

    def join_dp_to_calc(self, calc_df, dp_df):
        '''
        '''

        ## join the above two dataframes in order to determine ##
            ## which indicators require which caluclations ##
        dp_df_with_calc = dp_df.merge(calc_df,left_on='indicator_id',right_on=\
            'indicator_component_id')

        return dp_df_with_calc

    def raw_data(self):
        '''
        Add the raw indicator data to the tuple dict.  This happens last so
        the raw indicator data will always override the calculated.
        '''

        for adp in AggDataPoint.objects.filter(campaign_id = self.campaign_id):
            adp_tuple = (adp.location_id, adp.indicator_id, adp.campaign_id)
            self.dwc_tuple_dict[adp_tuple] = adp.value

    def sum_of_parts(self):
        '''
        For more info on this see:
        https://github.com/unicef/rhizome/blob/master/docs/spec.rst#aggregation-and-calculation

        '''

        ## get the indicator_ids we need to make the calculation ##
        calc_df = self.build_calc_df(['PART_TO_BE_SUMMED'])

        ## get the datapoints for the above indicator_ids ##
        dp_df = self.build_dp_df(calc_df['indicator_component_id'])

        ## now join the above dataframe on itself to set up the calculation ##
        prepped_for_calc_df = self.join_dp_to_calc(calc_df, dp_df)

        # ...

    def part_over_whole(self):

        raw_qs = AggDataPoint.objects.raw('''

        SELECT DISTINCT
             x.id
            ,part.indicator_id
            ,d_part.location_id
            ,d_part.campaign_id
            ,d_part.value / NULLIF(d_whole.value,0) as value
            ,d_part.cache_job_id
        FROM calculated_indicator_component part
        INNER JOIN (
            SELECT id from agg_datapoint LIMIT 1
            ) x ON 1=1
        INNER JOIN calculated_indicator_component whole
            ON part.indicator_id = whole.indicator_id
            AND whole.calculation = 'WHOLE'
            AND part.calculation = 'PART'
        INNER JOIN _tmp_calc_datapoint d_part
            ON part.indicator_component_id = d_part.indicator_id
        INNER JOIN _tmp_calc_datapoint d_whole
            ON whole.indicator_component_id = d_whole.indicator_id
            AND d_part.campaign_id = d_whole.campaign_id
            AND d_part.location_id = d_whole.location_id
        WHERE NOT EXISTS (
            SELECT 1 FROM _tmp_calc_datapoint tcd
            WHERE tcd.campaign_id = d_part.campaign_id
            AND tcd.location_id = d_part.location_id
            AND tcd.indicator_id = part.indicator_id
        );

        ''')

        for row in raw_qs:
            uq_tuple = (row.location_id, row.indicator_id, row.campaign_id)
            self.dwc_tuple_dict[uq_tuple] = row.value


    def part_of_difference(self):
        '''
        (x - y) / x
        '''

        calc_list = ['WHOLE_OF_DIFFERENCE_DENOMINATOR','PART_OF_DIFFERENCE']

        ## get the indicator_ids we need to make the calculation ##
        calc_df = self.build_calc_df(calc_list)

        ## get the datapoints for the above indicator_ids and join with dps ##
        dp_df = self.build_dp_df(calc_df['indicator_component_id'])
        dp_df_with_calc = self.join_dp_to_calc(calc_df, dp_df)

        ## now join the above dataframe on itself to set up the calculation ##
        prepped_for_calc_df = dp_df_with_calc.merge(dp_df_with_calc,\
            on=['location_id','campaign_id','calc_indicator_id'])

        ## iterrate through the dataframe above, determine the calculated value
        ## and finally, create the tuple dict calue for the - calculated data
        for ix, row_data in prepped_for_calc_df.iterrows():

            if row_data.calc_x == 'WHOLE_OF_DIFFERENCE_DENOMINATOR' \
                and row_data.calc_y == 'PART_OF_DIFFERENCE':

                row_tuple = (row_data.location_id, row_data.calc_indicator_id, \
                    row_data.campaign_id)

                ## this one line is where the calculation happens ##
                calculated_value = (row_data.value_x -row_data.value_y) / \
                    row_data.value_x


                self.dwc_tuple_dict[row_tuple] = calculated_value


    def upsert_computed(self):
        '''
        Using the tuple dict that defined the unique key and associated value
        for the various calculations, prepare this bulk insert, delete the
        existing campaign data then perform the bulk insert.
        '''
        for uq_tuple, val in self.dwc_tuple_dict.iteritems():

            dwc_dict = {'location_id': uq_tuple[0],
                'indicator_id': uq_tuple[1],
                'campaign_id': uq_tuple[2],
                'value': val,
                'cache_job_id': self.cache_job.id
            }

            self.dwc_batch.append(DataPointComputed(**dwc_dict))

        DataPointComputed.objects.filter(campaign_id=self.campaign_id).delete()
        DataPointComputed.objects.bulk_create(self.dwc_batch)



    def get_datapoints_to_agg(self,limit=None):
        '''
        Since there are complicated dependencies for location aggregation, as
        well as the interrationship between indicators, processing one campaign
        at a time makes our code much simpler.
        '''

        dp_ids = DataPoint.objects.filter(campaign_id = self.campaign_id)\
            .values_list('id',flat=True)

        return dp_ids

    def get_location_ids_to_process(self):

        location_cursor = location.objects.raw('''
            SELECT DISTINCT
                location_id as id
            FROM datapoint d
            WHERE cache_job_id = %s''',[self.cache_job.id])

        location_ids = [r.id for r in location_cursor]

        return location_ids


def cache_indicator_abstracted():
    '''
    Delete indicator abstracted, then re-insert by joiniding indicator boudns
    and creatign json for the indicator_bound field.  Also create the
    necessary JSON for the indicator_tag_json.

    This is the transformation that enables the API to return all indicator
    data without any transformation on request.
    '''

    i_raw = Indicator.objects.raw("""


        SELECT
             i.id
            ,i.short_name
            ,i.name
            ,i.slug
            ,i.description
            ,CASE WHEN CAST(x.bound_json as varchar) = '[null]' then '[]' ELSE x.bound_json END AS bound_json
            ,CASE WHEN CAST(y.tag_json as varchar) = '[null]' then '[]' ELSE y.tag_json END AS tag_json
        FROM (
            SELECT
            	i.id
            	,json_agg(row_to_json(ib.*)) as bound_json
            FROM indicator i
            LEFT JOIN indicator_bound ib
            ON i.id = ib.indicator_id
            GROUP BY i.id
        )x
		INNER JOIN (
            SELECT
            	i.id
            	,json_agg(itt.indicator_tag_id) as tag_json
            FROM indicator i
            LEFT JOIN indicator_to_tag itt
            ON i.id = itt.indicator_id

            GROUP BY i.id
		) y
		ON y.id = x.id
        INNER JOIN indicator i
        ON x.id = i.id

    """)

    upsert_meta_data(i_raw, IndicatorAbstracted)


def cache_user_abstracted():
    '''
    Just like indicator_abstracted, the user_abstraced table holds information
    that is keyed to the user, for instance, their groups and location permission.

    This data is cached in the cache_metadata process so the API is able to
    return data without transformation.
    '''

    u_raw = User.objects.raw(
    '''
        SELECT
		  	 au.id
   		  	,au.id as user_id
            ,au.last_login
        	,au.is_superuser
        	,au.username
        	,au.first_name
        	,au.last_name
        	,au.email
        	,au.is_staff
        	,au.is_active
        	,au.date_joined
			,gr.group_json
            ,rp.location_permission_json
        FROM auth_user au
        LEFT JOIN (
        	SELECT
        		 aug.user_id
        		,json_agg(row_to_json(aug.*)) AS group_json
        	FROM auth_user_groups aug
        	GROUP BY aug.user_id
        ) gr
        ON au.id = gr.user_id
        LEFT JOIN (
        	SELECT
        		 rp.user_id
        		,json_agg(row_to_json(rp.*)) as location_permission_json
        	FROM location_permission rp
        	GROUP BY rp.user_id
        ) rp
        ON au.id = rp.user_id
    '''
    )

    upsert_meta_data(u_raw, UserAbstracted)


def cache_campaign_abstracted():
    '''
    Add the pct-complete to the campaign based ont he pct of management
    indiators present for that campaign for the top level locations.
    '''

    ## temporarily harcoding indicators until we get management dashboard
    ## definition loading from the api... see:
    ## https://trello.com/c/nHSev5t9/226-8-front-end-api-calls-use-indicator-tag-to-populate-charts-and-dashboards

    all_indicators = [168, 431, 432, 433, 166, 164, 167, 165, 475, 187, 189, \
    27, 28, 175, 176, 177, 204, 178, 228, 179, 184, 180, 185, 230, 226, 239, \
    245, 236, 192, 193, 191, 194, 219, 173, 172, 169, 233, 158, 174, 442, 443, \
    444, 445, 446, 447, 448, 449, 450]

    # How many indicators does the ultimate parent have for each campaign #
    c_raw = Campaign.objects.raw(
        '''
        SELECT
            campaign_id as id
            ,COUNT(1) as indicator_cnt
        FROM datapoint_with_computed dwc
        WHERE indicator_id = ANY(%s)
        AND location_id IN (
            SELECT id FROM location l
            WHERE l.parent_location_id IS NULL
        )
        GROUP BY campaign_id;
        ''',[all_indicators])

    for c in c_raw:
        c_obj = Campaign.objects.get(id=c.id)
        c_obj.management_dash_pct_complete = c.indicator_cnt / \
            float(len(list(set(all_indicators))))
        c_obj.save()


def cache_location_tree():

    rt_raw = LocationTree.objects.raw(
    '''
    TRUNCATE TABLE location_tree;


    INSERT INTO location_tree
    (parent_location_id, immediate_parent_id, location_id, lvl)


    WITH RECURSIVE location_tree(parent_location_id, immediate_parent_id, location_id, lvl) AS
    (

    SELECT
    	rg.parent_location_id
    	,rg.parent_location_id as immediate_parent_id
    	,rg.id as location_id
    	,1 as lvl
    FROM location rg

    UNION ALL

    -- recursive term --
    SELECT
    	r_recurs.parent_location_id
    	,rt.parent_location_id as immediate_parent_id
    	,rt.location_id
    	,rt.lvl + 1
    FROM location AS r_recurs
    INNER JOIN location_tree AS rt
    ON (r_recurs.id = rt.parent_location_id)
    AND r_recurs.parent_location_id IS NOT NULL
    )

    SELECT
    	COALESCE(parent_location_id, location_id)  AS parent_location_id
    	,COALESCE(immediate_parent_id, location_id)  AS immediate_parent_id
    	,location_id
    	,lvl
    FROM location_tree;

    SELECT * FROM location_tree;
    ''')

    for x in rt_raw:
        pass # in order to execute raw sql


def update_source_object_names():

    som_raw = SourceObjectMap.objects.raw(
    '''
        DROP TABLE IF EXISTS _tmp_object_names;
        CREATE TEMP TABLE _tmp_object_names
        AS

        SELECT som.master_object_id, i.short_name as master_object_name, som.content_type
        FROM source_object_map som
        INNER JOIN indicator i
            ON som.master_object_id = i.id
            AND som.content_type = 'indicator'

        UNION ALL

        SELECT som.master_object_id, c.slug, som.content_type
        FROM source_object_map som
        INNER JOIN campaign c
            ON som.master_object_id = c.id
            AND som.content_type = 'campaign'

        UNION ALL

        SELECT som.master_object_id, r.name, som.content_type
        FROM source_object_map som
        INNER JOIN location r
            ON som.master_object_id = r.id
            AND som.content_type = 'location';

        UPDATE source_object_map som
        set master_object_name = t.master_object_name
        FROM _tmp_object_names t
        WHERE t.master_object_id = som.master_object_id
        AND t.content_type = som.content_type;

        SELECT * FROM source_object_map limit 1;

    ''')

    for row in som_raw:
        print row.id

def upsert_meta_data(qset, abstract_model):
    '''
    Given a raw queryset, and the model of the table to be upserted into,
    iterate through each resutl, clean the dictionary and batch delete and
    insert the data.
    '''

    batch = []

    for row in qset:

        row_data = dict(row.__dict__)
        del row_data['_state']

        object_instance = abstract_model(**row_data)
        batch.append(object_instance)

    abstract_model.objects.all().delete()
    abstract_model.objects.bulk_create(batch)
