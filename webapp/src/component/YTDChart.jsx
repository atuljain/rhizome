import _ from 'lodash'
import d3 from 'd3'
import moment from 'moment'
import React from 'react'

import Chart from 'component/Chart.jsx'

export default React.createClass({
  propTypes: {
    data: React.PropTypes.array.isRequired,
    id: React.PropTypes.string,
    options: React.PropTypes.object
  },

  getDefaultProps: function () {
    return {
      data: [],
      loading: false
    }
  },

  render: function () {
    var series = _(this.props.data)
      .groupBy(_.method('campaign.start_date.getFullYear'))
      .map(function (values, year) {
        return {
          name: year,
          values: _(values)
            .groupBy(_.method('campaign.start_date.getMonth'))
            .map(function (d, month) {
              return {
                month: Number(month),
                value: _(d).pluck('value').sum()
              }
            })
            .sortBy('month')
            .transform(function (result, d) {
              var o = {
                month: d.month,
                year: year,
                value: d.value,
                x: moment({ M: d.month }).toDate(),
                total: _.get(_.last(result), 'total', 0) + _.get(d, 'value', 0)
              }

              result.push(o)

              return result
            })
            .value()
        }
      })
      .sortBy('name')
      .value()

    var maxCases = _(series).pluck('values').flatten().pluck('total').max()
    var length = maxCases.toString().length
    var maxRange = _.ceil(maxCases, -(length - 1))

    var props = _.merge({},
      _.omit(this.props, 'id', 'data'), {
        data: series,
        options: {
          aspect: 2.61,
          domain: _.constant([moment({ M: 0 }).toDate(), moment({ M: 11 }).toDate()]),
          range: _.constant([0, maxRange]),
          color: ['#377EA3', '#D95348', '#82888e', '#98a0a8', '#b6c0cc'],
          x: _.property('x'),
          xFormat: d3.time.format('%b'),
          y: _.property('total'),
          hasDots: true
        }
      })

    return (
      <Chart type='LineChart' {...props} />
    )
  }
})
