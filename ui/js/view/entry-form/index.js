'use strict';

var _        = require('lodash');
var d3       = require('d3');

var api      = require('../../data/api');
var Dropdown = require('../../component/dropdown');
var flattenChildren = require('../../data/transform/flattenChildren');

module.exports = {

	template: require('./template.html'),

	data: function () {
		return {
			indicator_set_id: 2,
			indicator_sets: require('./structure/indicator_sets'),
			loaded: false,
			lookupRegionChildren: false,
			regions: [],
			indicators: [],
			pagination: {
				// the_limit: 20,
				// the_offset: 0,
				total_count: 0
			},
			table: {
				loading: false,
				columns: ['region', 'campaign'],
				rows: []
			},
			
			campaigns: [],
			campaign_id: null

		};
	},

	created: function() {

		// processing on indicator sets data
		_.forEach(this.indicator_sets, function(d) {
			// copy values for v-select:
			d.value = d.id;
			d.text = d.title;
		});

	},

	ready: function() {

		this.load();

	},

	attached: function () {
		var self = this;

		this._regions = new Dropdown({
			el     : '#regions',
			source : api.regions,
			mapping: {
				'parent_region_id': 'parent',
				'name'         : 'title',
				'id'           : 'value'
			}
		});
		this._regions.$on('dropdown-value-changed', function (items) {
			self.regions = items;
		});

		// this._indicators = new Dropdown({
		// 	el     : '#indicators',
		// 	source : api.indicators,
		// 	mapping: {
		// 		'short_name': 'title',
		// 		'id'        : 'value'
		// 	}
		// });

		// this._indicators.$on('dropdown-value-changed', function (items) {
		// 	self.indicators = items;
		// });

		this.$on('page-changed', function (data) {
			this.refresh(data);
		});
	},

	computed: {

		hasSelection: function () {
			return this.regions.length > 0;
			// return this.regions.length > 0 && this.indicators.length > 0;
		}

	},

	methods: {

		load: function() {
			var self = this;

			var makeMap = function(data) { 
				if (data.objects) {
					return _.indexBy(data.objects, 'id'); 
				} else {
					return null;
				}
			};

			var connectChildren = function(map, parent_id_key, children_key) {
				_.forIn(map, function(d, k) {
					// obj has parent_id?
					if (d[parent_id_key] !== undefined && d[parent_id_key] !== null) {
						// parent found?
						if (map[d[parent_id_key]]) {
							var parent = map[d[parent_id_key]];
							if (!parent[children_key]) { parent[children_key] = []; }
							parent[children_key].push(d);
						}
					}
				});
				return map;
			};

			Promise.all([

					// regions data
					api.regions()
						.then(makeMap)
						.then(function(map) {
							// create array of children in each parent
							return connectChildren(map, 'parent_region_id', 'children');
						}),

					// indicators data
					api.indicators().then(makeMap),

					// campaigns data
					api.campaign().then(function(data) {
						if (!data.objects) { return null; }
						return data.objects
							.sort(function(a,b) {
								if (a.office === b.office) {
									return a.start_date > b.start_date ? -1 : 1;
								}
								return a.office - b.office;
							})
							.map(function(d) {
								return {
									text: d.slug,
									value: d.id
								};
							});
					})

				]).done(function(allData) {

					self.$data.regionData = allData[0];
					self.$data.indicators = allData[1];
					self.$data.campaigns = allData[2];

					// set campaign id to first option
					// self.$data.campaign_id = self.$data.campaigns[0].value;
					self.$data.campaign_id = 139; // for testing

					self.$data.loaded = true;

				});

		},

		refresh: function (pagination) {
			// if (!this.hasSelection) {
			// 	return;
			// }

			var self = this;

			// default values for testing
			// var regions = [ 12942 ];
			// var regions = [ 12942, 12939, 12929, 12928, 12927, 12926, 12925, 12920, 12913, 12911, 12910 ];
			var regions = [ 12908, 12959, 12963, 12970, 13057, 13065, 13068, 13071, 13080, 13083, 13094, 13095, 13096, 13105, 13118, 13124, 13125, 13159, 13175, 13176, 13178, 13182, 13186, 13188, 13191, 13192, 13194, 13196, 13198, 13210, 13222, 13231, 13239, 13240, 13241, 13250, 13266, 13267, 13274, 13278, 13280, 13285, 13292, 13296, 13302, 13303, 13308, 13311, 13312, 13317, 13319, 13346, 13353, 13355, 13380, 13386, 13394, 13395, 13405, 13410, 13413, 13414, 13420, 13425, 13428, 13431, 13443, 13449, 13451, 13454, 12966, 14394 ];

			// get from dropdown
			if (this.hasSelection) {
				regions     = _.map(this.regions, 'value');
			}

			var options = { 
				campaign__in: parseInt(self.$data.campaign_id),
				// campaign_start: '2013-06-01',
				// campaign_end: '2013-06-30',
				indicator__in: [],
				region__in: []
			};

			if (pagination) {
				// Prepend "the_" to the pagination options (typically limit and offset)
				// because the datapoint API uses the_limit and the_offset instead of
				// limit and offset like the other paged APIs. See POLIO-194.
				_.forOwn(pagination, function (v, k) {
					options['the_' + k] = v;
				});
			}

			// add regions to request
			if (regions.length > 0) {
				
				// lookup children?
				if (self.$data.lookupRegionChildren === true) {
					options.region__in = [];
					_.forEach(regions, function(region_id) {
						var children = _.map(flattenChildren(self.$data.regionData[region_id], 'children'), function(d) { return d.id; });
						options.region__in.push(region_id);
						options.region__in = options.region__in.concat(children);						
					});
				}
				// no children
				else {
					options.region__in = regions;
				}

				console.log(options.region__in);

				// sort region order
				options.region__in = options.region__in.sort(function(a,b) {
					return self.$data.regionData[a].name > self.$data.regionData[b].name ? 1 : -1;
				});
			}

			// add indicators to request
			var indicatorSet = _.find(self.indicator_sets, function(d) { return d.id === parseInt(self.indicator_set_id); });
			indicatorSet.indicators.forEach(function (ind) {
				// TODO: remove the second condition below when on production:
				if (ind.id && self.$data.indicators[ind.id] !== undefined) {
					options.indicator__in.push(ind.id);
				}
			});

			// define columns
			var columns = [
				{ 
					header: 'Indicator', 
					type: 'label', 
					headerClasses: 'medium-3' 
				}
			];
			// add region names as columns
			regions.forEach(function(region_id) {
				columns.push({
					header: self.$data.regionData[region_id].name,
					type: 'value',
					key: region_id,
					children: null
				});
			});

			// cell formatters
			var numericFormatter = function (v) {
				return (isNaN(v) || _.isNull(v)) ? v : d3.format('n')(v);
			};

			_.defaults(options, this.pagination);

			this.table.loading = true;

			api.datapointsRaw(options).done(function (data) {
				self.table.loading = false;

				self.pagination.the_limit   = Number(data.meta.the_limit);
				self.pagination.the_offset  = Number(data.meta.the_offset);
				self.pagination.total_count = Number(data.meta.total_count);

				// arrange datapoints into an object of indicators > regions
				var byIndicator = {};
				data.objects.forEach(function(d) {
					if (!byIndicator[d.indicator_id]) { byIndicator[d.indicator_id] = {}; }
					byIndicator[d.indicator_id][d.region_id] = d;
				});

				// assemble data points into rows for table
				var rows = [];
				options.indicator__in.forEach(function(indicator_id) {
					
					var row = [];

					// add columns 
					columns.forEach(function(column) {

						var cell = {
							isEditable: false,
							type: column.type
						};

						switch (column.type) {

							// editable value
							case 'value':
								cell.isEditable = true;
								cell.format = numericFormatter;
								cell.classes = 'numeric';
								cell.width = 80;
								if (byIndicator[indicator_id] && byIndicator[indicator_id][column.key]) {
									cell.datapoint_id = byIndicator[indicator_id][column.key].datapoint_id;
									cell.value = byIndicator[indicator_id][column.key].value;
									cell.note = byIndicator[indicator_id][column.key].note;
								} else {
									cell.datapoint_id = null;
									cell.value = null;
									cell.note = null;
								}
								// generate promise for submitting a new value to the API for saving
								cell.buildSubmitPromise = function(newVal) {
									var upsert_options = {
										datapoint_id: cell.datapoint_id,
										campaign_id: options.campaign__in,
										indicator_id: indicator_id,
										region_id: column.key,
										value: parseFloat(newVal)
									};
									return api.datapointUpsert(upsert_options);
								};
								// callback to specifically handle response
								cell.withResponse = function(response) {
									console.log('done!', response);
								};
								break;

							// indicator name
							case 'label':
								cell.value = self.$data.indicators[indicator_id] ? self.$data.indicators[indicator_id].name : 'Missing info for indicator '+indicator_id;
								cell.width = 200;
								break;

						}

						// add cell to row
						row.push(cell);
					});

					// add row to main array
					rows.push(row);
				});

				self.table.rows = rows;
				self.table.columns = columns;

			});
		}

	}
};
