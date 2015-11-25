import Reflux from 'reflux'

let ChartWizardActions = Reflux.createActions([
  'initialize',
  'clear',
  'editTitle',
  'addLocation',
  'selectCountry',
  'addFirstIndicator',
  'addIndicator',
  'removeIndicator',
  'addCampaign',
  'changeChart',
  'changeGroupRadio',
  'changeLocationLevelRadio',
  'changeTimeRadio',
  'changeYFormatRadio',
  'changeXFormatRadio',
  'changeYAxis',
  'changeZAxis',
  'changePalette',
  'saveChart'
])

export default ChartWizardActions
