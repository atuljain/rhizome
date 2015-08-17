var React = require('react/addons');
var _ = require('lodash');

var API = require('../data/api');

var {
	Datascope, LocalDatascope,
	SimpleDataTable, SimpleDataTableColumn,
	Paginator, SearchBar,
	FilterPanel, FilterDateRange
	} = require('react-datascope');

var ReviewPage = require('./ReviewPage');

var ValidateForm = function(is_checked){
	if (is_checked){
		return <input type="checkbox" checked />;
	}
	else{
		return <input type="checkbox" />;
	}

}

const fields = {
	validate_check_box_form: {
		title: 'Validate',
		key: 'is_valid',
		renderer: (is_valid) => {
				return ValidateForm(is_valid)
			}
	},
};


const fieldNamesOnTable = ['id','region_id','campaign_id','indicator_id','value','validate_check_box_form'];

var DocValidate = React.createClass({
	render() {

		var doc_id = this.props.params.docId

		var datascopeFilters =
			<div>
				<SearchBar placeholder="..search.."/>
				<FilterPanel>
					// <FilterDateRange name="start_date" time={false} />
					// <FilterDateRange name="end_date" time={false} />
					</FilterPanel>
			</div>;

		var data_fn = function(){
			return API.admin.docValidate({document:doc_id},null,{'cache-control':'no-cache'})
		};

		return <ReviewPage
			title="Validation Page"
			getMetadata={API.admin.docValidateMeta}
			getData={data_fn}
			datascopeFilters={datascopeFilters}
			fields={fields}
			>
				<Paginator />
				<SimpleDataTable>
					{fieldNamesOnTable.map(fieldName => {
						return <SimpleDataTableColumn name={fieldName} />
					})}
				</SimpleDataTable>
		</ReviewPage>
	}
});

module.exports = DocValidate;
