import Reflux from 'reflux'
import _ from 'lodash'
import moment from 'moment'

import ChartWizardActions from 'actions/ChartWizardActions'
import api from 'data/api'
import ChartDataInit from 'data/chartDataInit'
import builderDefinitions from 'stores/chartBuilder/builderDefinitions'
import treeify from 'data/transform/treeify'
import ancestryString from 'data/transform/ancestryString'

let ChartWizardStore = Reflux.createStore({
  listenables: ChartWizardActions,
  data: {
    indicatorList: [],
    indicatorSelected: [],
    indicatorFilteredList: [],
    locationList: [],
    countryList: [],
    subLocationList: [],
    locationSelected: null,
    countries: [],
    campaignFilteredList: [],
    timeRangeFilteredList: [],
    chartTypeFilteredList: [],
    groupByValue: 0,
    locationLevelValue: 0,
    timeValue: 0,
    yFormatValue: 0,
    xFormatValue: 0,
    canDisplayChart: false,
    isLoading: true,
    chartOptions: {},
    chartData: [],
    chartDef: {}
  },
  LAYOUT_PREVIEW: 0,

  filterCampaignByLocation (campaigns, location) {
    return campaigns.filter(campaign => {
      return campaign.office_id === location.office_id
    })
  },

  filterTimeRangeByChartType (timeRanges, chartType) {
    let expectTimes = _.find(builderDefinitions.charts, { name: chartType }).timeRadios
    return timeRanges.filter(time => {
      return _.includes(expectTimes, time.value)
    })
  },

  filterChartTypeByIndicator () {
    api.chartType({ primary_indicator_id: this.data.indicatorSelected[0].id }, null, {'cache-control': 'no-cache'}).then(res => {
      let availableCharts = res.objects.map(chart => {
        return chart.name
      })
      this.data.chartTypeFilteredList = builderDefinitions.charts.filter(chart => {
        return _.includes(availableCharts, chart.name)
      })

      if (!_.includes(availableCharts, this.data.chartDef.type)) {
        this.onChangeChart(this.data.chartTypeFilteredList[0].name)
      }
    })
  },

  applyChartDef (chartDef) {
    this.data.locationLevelValue = Math.max(_.findIndex(builderDefinitions.locationLevels, { value: chartDef.locations }), 0)
    this.data.locationSelected = builderDefinitions.locationLevels[this.data.locationLevelValue].getAggregated(this.data.location, this.locationIndex)
    this.data.groupByValue = Math.max(_.findIndex(builderDefinitions.groups, { value: chartDef.groupBy }), 0)
    this.data.timeValue = Math.max(_.findIndex(this.data.timeRangeFilteredList, { json: chartDef.timeRange }), 0)
    this.data.yFormatValue = Math.max(_.findIndex(builderDefinitions.formats, { value: chartDef.yFormat }), 0)
    this.data.xFormatValue = Math.max(_.findIndex(builderDefinitions.formats, { value: chartDef.xFormat }), 0)

    this.data.chartDef.locations = builderDefinitions.locationLevels[this.data.locationLevelValue].value
    this.data.chartDef.groupBy = builderDefinitions.groups[this.data.groupByValue].value
    this.data.chartDef.timeRange = this.data.timeRangeFilteredList[this.data.timeValue].json
    this.data.chartDef.yFormat = builderDefinitions.formats[this.data.yFormatValue].value
    this.data.chartDef.xFormat = builderDefinitions.formats[this.data.xFormatValue].value
  },

  getInitialState () {
    return this.data
  },

  async onInitialize (chartDef) {
    this.data.chartDef = _.clone(chartDef)

    let locations = await api.locations()
    let campaigns = await api.campaign()
    let offices = await api.office()

    this.locationIndex = _.indexBy(locations.objects, 'id')
    this.data.locationList = _(locations.objects)
      .map(location => {
        return {
          'title': location.name,
          'value': location.id,
          'parent': location.parent_location_id
        }
      })
      .sortBy('title')
      .reverse()
      .thru(_.curryRight(treeify)('value'))
      .map(ancestryString)
      .value()
    this.data.subLocationList = _.clone(this.data.locationList)
    this.data.countryList = this.data.locationList
      .map(location => {
        return {
          'title': location.title,
          'value': location.value,
        }
      })

    this.data.location = this.data.chartDef.locationValue && this.locationIndex[this.data.chartDef.locationValue]
      ? this.locationIndex[this.data.chartDef.locationValue]
      : this.locationIndex[this.data.locationList[0].value]

    this.data.countries = [this.data.location]
    let officeId = this.data.location.office_id

    let indicators = await api.indicatorsTree({ office_id: officeId })

    this.indicatorIndex = _.indexBy(indicators.flat, 'id')
    this.data.indicatorList = _.sortBy(indicators.objects, 'title')
    this.data.indicatorSelected = chartDef.indicators.map(id => {
      return this.indicatorIndex[id]
    })

    let officeIndex = _.indexBy(offices.objects, 'id')
    this.campaignList = _(campaigns.objects)
      .map(campaign => {
        return _.assign({}, campaign, {
          'start_date': moment(campaign.start_date, 'YYYY-MM-DD').toDate(),
          'end_date': moment(campaign.end_date, 'YYYY-MM-DD').toDate(),
          'office': officeIndex[campaign.office_id]
        })
      })
      .sortBy(_.method('start_date.getTime'))
      .reverse()
      .value()

    this.campaignIndex = _.indexBy(this.campaignList, 'id')
    this.data.campaignFilteredList = this.filterCampaignByLocation(this.campaignList, this.data.location)
    this.data.timeRangeFilteredList = this.filterTimeRangeByChartType(builderDefinitions.times, this.data.chartDef.type)
    this.data.chartTypeFilteredList = builderDefinitions.charts

    if (this.data.chartDef.campaignValue && this.campaignIndex[chartDef.campaignValue]) {
      this.data.campaign = this.campaignIndex[chartDef.campaignValue]
    } else {
      this.data.campaign = this.data.campaignFilteredList.length > 0
        ? this.data.campaignFilteredList[0]
        : null
    }

    if (this.data.indicatorSelected.length > 0) {
      this.filterChartTypeByIndicator()
    }

    this.applyChartDef(this.data.chartDef)
    this.previewChart()
  },

  onClear () {
    this.data = {
      indicatorList: [],
      indicatorSelected: [],
      indicatorFilteredList: [],
      locationList: [],
      locationSelected: null,
      campaignFilteredList: [],
      timeRangeFilteredList: [],
      chartTypeFilteredList: [],
      groupByValue: 0,
      locationLevelValue: 0,
      timeValue: 0,
      yFormatValue: 0,
      xFormatValue: 0,
      canDisplayChart: false,
      isLoading: true,
      chartOptions: {},
      chartData: [],
      chartDef: {}
    }
  },

  onEditTitle (value) {
    this.data.chartDef.title = value
  },

  onSelectCountry (countryIndexes) {
    this.data.countries = countryIndexes.map((index) => this.locationIndex[index])
    this.data.locationSelected = this.data.countries[0]
    let subLocationsForCountry = _.select(this.data.locationList, location => _.includes(countryIndexes, '' + location.value))
    this.data.subLocationList = _.flatten(subLocationsForCountry.map((locationList) => locationList.children))
    this.updateIndicatorAndCampaign(this.data.countries)
  },

  onAddLocation (locationIndexes) {
    this.data.locations = locationIndexes.map((index) => this.locationIndex[index])
    this.data.locationSelected = this.data.locations[0]
    this.updateIndicatorAndCampaign(this.data.locations)
  },

  onAddFirstIndicator (index) {
    this.data.indicatorSelected[0] = this.indicatorIndex[index]
    this.filterChartTypeByIndicator()
    this.previewChart()
  },

  onAddIndicator (index) {
    if (this.data.indicatorSelected.map(indicator => indicator.id).indexOf(index) >= 0) return
    this.data.indicatorSelected.push(this.indicatorIndex[index])
    this.data.chartDef.y = index
    this.previewChart()
  },

  onRemoveIndicator (id) {
    _.remove(this.data.indicatorSelected, {id: id})
    this.previewChart()
  },

  onAddCampaign (index) {
    this.data.campaign = this.campaignIndex[index]
    this.previewChart()
  },

  onChangeChart (value) {
    this.data.chartDef.type = value
    this.data.timeRangeFilteredList = this.filterTimeRangeByChartType(builderDefinitions.times, this.data.chartDef.type)
    this.data.timeValue = Math.min(this.data.timeValue, this.data.timeRangeFilteredList.length - 1)
    this.data.chartDef.timeRange = this.data.timeRangeFilteredList[this.data.timeValue].json

    if (value === 'ChoroplethMap') {
      this.data.locationLevelValue = _.findIndex(builderDefinitions.locationLevels, {value: 'sublocations'})
    }
    this.data.chartDef.x = this.data.indicatorSelected[0].id

    this.data.locationSelected = builderDefinitions.locationLevels[this.data.locationLevelValue].getAggregated(this.data.location, this.locationIndex)
    this.data.chartData = []
    this.previewChart()
  },

  onChangeGroupRadio (value) {
    this.data.groupByValue = value
    this.data.chartDef.groupBy = builderDefinitions.groups[value].value
    this.previewChart()
  },

  onChangeLocationLevelRadio (value) {
    this.data.locationLevelValue = value
    this.data.locationSelected = builderDefinitions.locationLevels[value].getAggregated(this.data.location, this.locationIndex)
    this.previewChart()
  },

  onChangeTimeRadio (value) {
    this.data.timeValue = value
    this.data.chartDef.timeRange = this.data.timeRangeFilteredList[value].json
    this.previewChart()
  },

  onChangeYFormatRadio (value) {
    this.data.yFormatValue = value
    this.data.chartDef.yFormat = builderDefinitions.formats[value].value
    this.previewChart()
  },

  onChangeXFormatRadio (value) {
    this.data.xFormatValue = value
    this.data.chartDef.xFormat = builderDefinitions.formats[value].value
    this.previewChart()
  },

  onChangeYAxis (value) {
    this.data.indicatorSelected[1] = this.indicatorIndex[value]
    this.data.chartDef.y = value
    this.previewChart()
  },

  onChangeZAxis (value) {
    this.data.indicatorSelected[2] = this.indicatorIndex[value]
    this.data.chartDef.z = value
    this.previewChart()
  },

  onChangePalette (key) {
    this.data.chartDef.palette = key
    this.previewChart()
  },

  onSaveChart (callback) {
    callback(
      _.merge(
        this.data.chartDef,
        {
          indicators: this.data.indicatorSelected.map(item => {
            return item.id
          }),
          groupBy: builderDefinitions.groups[this.data.groupByValue].value,
          locations: builderDefinitions.locationLevels[this.data.locationLevelValue].value,
          locationValue: this.data.location.id,
          campaignValue: this.data.campaign.id,
          timeRange: this.data.timeRangeFilteredList[this.data.timeValue].json,
          yFormat: builderDefinitions.formats[this.data.yFormatValue].value,
          xFormat: builderDefinitions.formats[this.data.xFormatValue].value
        }, (source, override) => {
          return override
        }
      )
    )
  },

  previewChart () {
    if (!this.data.indicatorSelected.length) {
      this.data.canDisplayChart = false
      this.data.isLoading = false
      this.trigger(this.data)
      return
    }

    this.data.isLoading = true
    this.trigger(this.data)

    ChartDataInit.fetchChart(this.data.chartDef, this.data, this.indicatorIndex, this.LAYOUT_PREVIEW).then(chart => {
      this.data.canDisplayChart = true
      this.data.isLoading = false
      this.data.chartOptions = chart.options
      this.data.chartData = chart.data
      this.trigger(this.data)
    })
  },

  updateIndicatorAndCampaign (locations) {
    api.indicatorsTree({ office_id: locations.map((location) => location.office_id).join(',') }).then(indicators => {
      this.indicatorIndex = _.indexBy(indicators.flat, 'id')
      this.data.indicatorList = _.sortBy(indicators.objects, 'title')
      if(this.data.chartDef.indicators.length > 0) {
        this.data.indicatorSelected = this.data.chartDef.indicators.map(id => {
          return this.indicatorIndex[id]
        })
      }

      this.data.campaignFilteredList = this.filterCampaignByLocation(this.campaignList, locations[0])
      let newCampaign = this.data.campaignFilteredList.filter(campaign => {
        return moment(campaign.start_date).format() === moment(this.data.campaign.start_date).format()
      })
      this.data.campaign = newCampaign.length > 0 ? newCampaign[0] : this.data.campaignFilteredList[0]
      this.previewChart()
    })
  }
})

export default ChartWizardStore
