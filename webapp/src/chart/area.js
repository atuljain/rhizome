'use strict'

var _ = require('lodash')
var d3 = require('d3')

var format = require('util/format')
var hoverLine = require('chart/behavior/hover-line')
var label = require('chart/renderer/label')

var DEFAULTS = {
  margin: {
    top: 12,
    right: 0,
    bottom: 12,
    left: 0
  },
  scale: d3.scale.linear,
  seriesName: _.property('name'),
  values: _.property('values'),
  x: _.property('campaign.start_date'),
  xFormat: format.timeAxis,
  y: _.property('value'),
  yFormat: d3.format(',d')
}

function AreaChart () {}

_.extend(AreaChart.prototype, {
  defaults: DEFAULTS,

  update: function (series, options) {
    series = _(series).filter(serie => {
      serie.values = _(serie.values).reject(item => {
        return item.value === null
      }).value()
      return serie.values.length > 0
    }).value()

    options = _.assign(this._options, options)

    var margin = options.margin

    var svg = this._svg
    var width = this._width - margin.left - margin.right
    var height = this._height - margin.top - margin.bottom

    var fillColor = options.fill
    var strokeColor = options.stroke

    if (!_.isFunction(fillColor)) {
      var fillColorScale = d3.scale.ordinal()
        .domain(_.map(series, options.seriesName))
        .range(['#C4D9DC', '#A2AAB3', '#E5E9EC', '#D8D9E1'])
      fillColor = _.flow(options.seriesName, fillColorScale)
    }

    if (!_.isFunction(strokeColor)) {
      var strokeColorScale = d3.scale.ordinal()
        .domain(_.map(series, options.seriesName))
        .range(['#707070', '#87939F', '#B9C3CB', '#B0B3C3'])
      strokeColor = _.flow(options.seriesName, strokeColorScale)
    }

    var domain = _.isFunction(options.domain)
      ? options.domain(series)
      : d3.extent(_(series)
      .map(options.values)
      .flatten()
      .map(options.x)
      .value())

    var xScale = d3.time.scale()
      .domain(domain)
      .range([0, width])

    var range = _.isFunction(options.range)
      ? options.range(series)
      : d3.extent(_(series)
      .map(options.values)
      .flatten()
      .map(options.y)
      .value())

    range[0] = 0

    var yScale = options.scale()
      .domain(range)
      .range([height, 0])

    var x = _.flow(options.x, xScale)
    var y = _.flow(options.y, yScale)

    var points = _(series).map(function (s) {
    // Set the series name on each datapoint for easy retrieval
      return _.map(options.values(s), _.partial(_.set, _, 'seriesName', options.seriesName(s)))
    })
      .flatten()
      .value()

    // Set up the hover interaction
    svg.attr('class', 'area')
      .call(hoverLine()
        .width(width)
        .height(height)
        .xFormat(options.xFormat)
        .yFormat(options.yFormat)
        .x(options.x)
        .y(options.y)
        .xScale(xScale)
        .yScale(yScale)
        .value(options.y)
        .seriesName(_.property('seriesName'))
        .sort(true)
        .datapoints(points)
    )

    var g = svg.select('.data')
      .selectAll('.series')
      .data(series, options.seriesName)

    g.enter()
      .append('g')
      .attr('class', 'series')

    g.style({
      'fill': fillColor,
      'stroke': strokeColor
    })

    g.exit().remove()

    var path = g.selectAll('path')
      .data(function (d) {
        return [options.values(d)]
      })

    path.enter().append('path')

    var area = d3.svg.area()
      .x(x)
      .y0(height)
      .y1(y)

    path.transition()
      .duration(500)
      .attr('d', area)

    var labels = _(series)
      .map(function (d) {
        var last = _.max(options.values(d), options.x)
        var v = options.y(last)

        return {
          text: options.seriesName(d) + ' ' + options.yFormat(v),
          x: x(last),
          y: y(last),
          defined: _.isFinite(v)
        }
      })
      .filter('defined')
      .sortBy('y')
      .value()

    var total = 0
    _.forEach(series, (d) => {
      var last = _.max(options.values(d), options.x)
      total += options.y(last)
    })
    var fm = d3.format(',.1%')

    svg.select('.annotation')
      .selectAll('.series.label')
      .data(labels)
      .call(label()
        .addClass('series')
        .width(width)
        .height(height)
        .align(false))

    svg.select('.x.axis')
      .call(d3.svg.axis()
        .tickFormat(options.xFormat)
        .outerTickSize(0)
        .ticks(4)
        .scale(xScale)
        .orient('bottom'))

    var isTrue = false
    var isNotInaccessible = (points) => {
      _.forEach(points, function (point) {
        if (point.seriesName !== 'Inaccessible Children') {
          isTrue = true
        }
      })
      return isTrue
    }

    if (total !== 0 && isNotInaccessible(points)) {
      svg.select('.annotation')
      .append('text')
      .attr('x', this._width - 90)
      .attr('y', -15)
      .attr('width', 10)
      .attr('height', 10)
      .style({
        'font-size': '15px;'
      })
      .text('TOTAL ' + fm(total))
    }

    var gy = svg.select('.y.axis')
      .call(d3.svg.axis()
        .tickFormat(options.yFormat)
        .tickSize(width)
        .ticks(3)
        .scale(yScale)
        .orient('right'))

    gy.selectAll('text')
      .attr({
        'x': 4,
        'dy': -4
      })

    gy.selectAll('g').classed('minor', function (d) {
      return d !== range[0]
    })
  }
})

module.exports = AreaChart
