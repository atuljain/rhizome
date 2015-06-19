'use strict';

var _      = require('lodash');
//var moment = require('moment');
var React  = require('react');
var DragDropMixin = require('react-dnd').DragDropMixin;
var Reflux = require('reflux/src');
var ChartBuilder = require('view/chart-builder/ChartBuilder.jsx');

var dashboardInit = require('data/dashboardInit');

var DataActions = require('actions/DataActions');
var DataStore = require('stores/DataStore');

var DashboardBuilderActions  = require('actions/DashboardBuilderActions');
var DashboardBuilderStore    = require("stores/DashboardBuilderStore");

var DashboardActions  = require('actions/DashboardActions');
var DashboardStore    = require("stores/DashboardStore");

var IndicatorStore      = require('stores/IndicatorStore');
var GeoStore            = require('stores/GeoStore');
var GeoActions          = require('actions/GeoActions');
var AppActions          = require('actions/AppActions');
var RegionTitleMenu     = require('component/RegionTitleMenu.jsx');
var CampaignTitleMenu   = require('component/CampaignTitleMenu.jsx');

var CustomDashboard     = require('dashboard/CustomDashboard.jsx');

var moment = require('moment');

module.exports = React.createClass({
	mixins: [Reflux.connect(DashboardBuilderStore,"store"), Reflux.connect(DataStore,"dataStore"),Reflux.connect(DashboardStore,"dashboardStore"),Reflux.ListenerMixin],
	componentWillMount:function(){
	AppActions.init();
	},
	componentDidMount:function(){
	   DashboardBuilderActions.initialize(this.props.dashboard_id);
	   this.listenTo(DashboardStore,this._onDataLoaded);
	   this.listenTo(DashboardBuilderStore,this._onDataLoaded);
	   this.listenTo(DashboardStore,this._onDashboardChange);
	   this.indicatorUnsubscribe = this.listenTo(IndicatorStore,this._onIndicatorsChange);
	   
	},
	getInitialState:function(){
	  return {
	    chartBuilderActive:false,
	    chartBuilderindex:null
	  }
	},
	editChart:function(index){
	  this.setState({chartBuilderindex : index,chartBuilderActive:true});
	},
	newChart:function(){
	  this.setState({chartBuilderindex : null,chartBuilderActive:true});
	},
	saveChart:function(chartDef){
	    if(!_.isNull(this.state.chartBuilderindex)) //if editing, replace the chart at the index in JSON,
	    {
	      DashboardBuilderActions.updateChart(chartDef,this.state.chartBuilderindex);
	    }
	    else {//add chart
	      DashboardBuilderActions.addChart(chartDef);
	    }
		this.setState({chartBuilderindex : null,chartBuilderActive:false});
	},
	_onIndicatorsChange : function () {
	  this.forceUpdate();
	},
	_onDashboardChange : function (state) {
	    var dashboardSet = this.state.dashboardStore.dashboard;
	
	    if (dashboardSet) {
	      var q = DashboardStore.getQueries();
	
	      if (_.isEmpty(q)) {
	        DataActions.clear();
	      } else {
	        DataActions.fetch(this.state.dashboardStore.campaign, this.state.dashboardStore.region, q);
	      }
	
	      if (this.state.dashboardStore.hasMap) {
	        GeoActions.fetch(this.state.dashboardStore.region);
	      }
	    } 
	},
	_setCampaign : function (id) {
	    var campaign  = _.find(this.state.dashboardStore.campaigns, c => c.id === id);
	
	    if (!campaign) {
	      return;
	    }
	    
	    DashboardActions.setDashboard({dashboard:this.state.store.dashboard,date:moment(campaign.start_date, 'YYYY-MM-DD').format('YYYY-MM')});
	},
	_setRegion : function (id) {
	    var region    = _.find(this.state.dashboardStore.regions, r => r.id === id)
	     
	    if (!region) {
	      return;
	    }
	
	   DashboardActions.setDashboard({dashboard:this.state.store.dashboard,region:region.name});
	},
    _onDataLoaded : function(){
     if(this.props.dashboard_id && this.state.store && this.state.dashboardStore && this.state.store.loaded && this.state.dashboardStore.loaded && !this.state.dashboardStore.dashboard)
     {
     	DashboardActions.setDashboard({dashboard:this.state.store.dashboard});
     }
    },
    _updateTitle : function(e){
    DashboardBuilderActions.updateTitle(e.currentTarget.value);
  },
	render: function(){
	  if(this.state.store.newDashboard) {	     
	     return (<form className='inline no-print dashboard-builder-container'>
	  				<h1>Create a New Custom Dashboard</h1>
	  				<div className="titleDiv">Dashboard Title</div>
	  				<input type="text" value={this.state.store.dashboardTitle} onChange={this._updateTitle} />   
	  	{this.state.store.dashboardTitle.length?<a href="#" className="button next-button" onClick={DashboardBuilderActions.addDashboard} >Next</a>:null}		
	             </form>);
	  }
      else if (!(this.state.dashboardStore && this.state.dashboardStore.loaded && this.state.dashboardStore.dashboard)) {
        var style = {
          fontSize      : '2rem',
        };
  
        return (
          <div style={style} className='overlay'>
            <div>
              <div><i className='fa fa-spinner fa-spin'></i>&ensp;Loading</div>
            </div>
          </div>
        );
      }
	
      var self = this;
      var campaign      = this.state.dashboardStore.campaign;
      var dashboardDef  = this.state.store.dashboard;
      var loading       = this.state.dashboardStore.loading;
      var region        = this.state.dashboardStore.region;
      var dashboardName = _.get(dashboardDef, 'title', '');
      
      var indicators = IndicatorStore.getById.apply(
        IndicatorStore,
        _(_.get(dashboardDef, 'charts', []))
          .pluck('indicators')
          .flatten()
          .uniq()
          .value()
      );
      
      var data = dashboardInit(
        dashboardDef,
        this.state.dataStore.data,
        region,
        campaign,
        this.state.dashboardStore.regions,
        indicators,
        GeoStore.features
      );
      
      var dashboardProps = {
        campaign   : campaign,
        dashboard  : dashboardDef,
        data       : data,
        indicators : indicators,
        loading    : loading,
        region     : region
      };
      
      var dashboard = React.createElement(
        CustomDashboard,
        dashboardProps);
      
      var campaigns = _(this.state.dashboardStore.campaigns)
        .filter(c => c.office_id === region.office_id)
        .sortBy('start_date')
        .reverse()
        .value();
      
       if (campaign.office_id !== region.office_id) {
         campaign = campaigns[0];
       }
       
      
      
      var charts = this.state.store.dashboard.charts.map(function(chart,index){
          return (
            <div className="vis-box" key={index}>{chart.title}
            <a href="#" onClick={self.editChart.bind(null,index)} className="button">edit chart</a>
            </div>
          );
       }); 
       
	   var dashboardBuilderContainer = (
	         <div>
	           <div classNameName='clearfix'></div>
	   
	           <form className='inline no-print'>
	             <div className='row'>
	               <div className='medium-6 columns'>
	                 <h1>
	                   <CampaignTitleMenu
	                     campaigns={campaigns}
	                     selected={campaign}
	                     sendValue={this._setCampaign} />
	                   &emsp;
	                   <RegionTitleMenu
	                     regions={this.state.dashboardStore.regions}
	                     selected={region}
	                     sendValue={this._setRegion} />
	                 </h1>
	               </div>
	             </div>
	           </form>
	           <div className="custom-dashboard-title-container">
	           <div className="titleDiv">Dashboard Title</div>
	           	<input type="text" value={this.state.store.dashboardTitle} onChange={this._updateTitle} />   
	           </div>
	           {dashboard}
	           {charts}
	           <a  onClick={this.newChart} className="button">add chart</a>
	         </div>
	   );
	   if(!this.state.store.loaded)
	   {
	   	 return (<div>loading</div>);
	   }
	   else if(this.state.chartBuilderActive)
	   {
	    var chartDef = (_.isNull(this.state.chartBuilderindex)?null:this.state.store.dashboard.charts[this.state.chartBuilderindex]);
	   	return (<ChartBuilder dashboardId={this.props.dashboard_id} chartDef={chartDef} callback={this.saveChart} campaign={campaign} region={region} />);
	   }
	   else {
	   	return dashboardBuilderContainer;
	   }
	}
});