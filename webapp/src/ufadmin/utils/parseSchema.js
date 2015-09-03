var _ = require('lodash');

module.exports = function parseSchema(data) {

	var data_fields = Object.keys(data.objects[0]);
	//
	var fields = data_fields.map(function(f){
	   var fObj = {'name':f,'title':f};
	   return fObj;
	});

	var schema = {
		$schema: "http://json-schema.org/draft-04/schema#",
		title: "table_schema",
		type: "array",
		items: {
			title: "table_row",
			type: "object",
			properties: _(fields).map(field => {
				return [field.name, _.transform(field, (result, val, key) => {
					result[key] = val;
				})]
			}).object().value()
		}
	};
	return schema;
};
