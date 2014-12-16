/* global window */

'use strict';

var _ = require('lodash');

var dom = require('../../util/dom');

module.exports = {
	template: require('./template.html'),

	paramAttributes: [
		'placeholder',
		'searchable',
		'multi',
		'loading',
		'loadedEvent'
	],

	data: function () {
		return {
			pattern    : '',
			open       : false,
			opening    : false,
			menuHeight : 0,
			menuX      : 0
		};
	},

	ready: function () {
		this.searchable = this.searchable === 'true';
		this.multi      = this.multi === 'true';

		this.$on(this.loadedEvent, function () { this.loading = false; });
	},

	computed: {
		selected: function () {
			return this.items.filter(function (o) {
				return o.selected;
			});
		},

		value: function () {
			var selected = this.selected;

			return this.multi ?
				selected.map(function (o) { return o.value; }) :
				selected[0].value;
		},

		sortValue: function () {
			return this.sortVal || this.title;
		},

		title: function () {
			var selected = this.selected;

			return selected.length === 0 ? this.placeholder :
				this.multi ? selected.map(function (o) { return o.title; }).join(', ') :
					selected[0].title;
		},
	},

	methods: {
		toggle: function () {
			this.opening = this.open = !this.open;

			if (this.searchable) {
				var inpt = this.$el.getElementsByTagName('input')[0];

				// Reset the query
				this.pattern = '';

				if (this.open) {
					inpt.focus();
				}
			}

			if (this.open) {
				window.addEventListener('scroll', this);
				window.addEventListener('resize', this);
				window.addEventListener('click', this);
				window.addEventListener('keyup', this);
				this.invalidateSize();

				this.$el.getElementsByTagName('ul')[0].scrollTop = 0;
			} else {
				window.removeEventListener('scroll', this);
				window.removeEventListener('resize', this);
				window.removeEventListener('click', this);
				window.removeEventListener('keyup', this);
			}
		},

		onClick: function (item) {
			if (this.multi) {
				item.selected = !item.selected;
			} else {
				this.items.forEach(function (o) { o.selected = false; });
				item.selected = true;
				this.open = false;
			}

			this.$dispatch('selection-changed', {
				selected: this.multi ? this.selected : this.selected[0],
				changed: item
			});
		},

		handleEvent: function (evt) {
			switch (evt.type) {
			case 'keyup':
				// ESC
				if (evt.keyCode === 27) {
					this.open = false;
				}
				break;
			case 'click':
				if (this.opening) {
					this.opening = false;
				} else if (!dom.contains(this.$el.getElementsByClassName('container')[0], evt)) {
					this.open = false;
				}
				break;
			case 'scroll':
			case 'resize':
				this.invalidateSize();
				break;
			default:
				break;
			}
		},

		invalidateSize: _.throttle(function () {
			var menu         = this.$el.getElementsByClassName('container')[0];
			var ul           = menu.getElementsByTagName('ul')[0];
			var style        = window.getComputedStyle(menu);
			var marginBottom = parseInt(style.getPropertyValue('margin-bottom'), 10);
			var marginRight  = parseInt(style.getPropertyValue('margin-right'), 10);
			var offset       = dom.viewportOffset(ul);
			var dims;

			if (this.multi) {
				dims          = dom.dimensions(menu.getElementsByClassName('selection-controls')[0], true);
				marginBottom += dims.height;
			}

			dims = dom.dimensions(menu);

			this.menuHeight = window.innerHeight - offset.top - marginBottom;
			this.menuX = Math.min(0, window.innerWidth - dom.viewportOffset(this.$el).left - dims.width - marginRight);
		}, 100, { leading: false }),

		clear: function () {
			this.items.forEach(function (o) { o.selected = false; });
		},

		invert: function () {
			this.items.forEach(function (o) { o.selected = !o.selected; });
		},

		selectAll: function () {
			this.items.forEach(function (o) { o.selected = true; });
		}
	}
};
