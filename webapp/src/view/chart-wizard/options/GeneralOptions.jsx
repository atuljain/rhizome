import React from 'react'

import List from 'component/list/List.jsx'
import IndicatorDropdownMenu from 'component/IndicatorDropdownMenu.jsx'
import RadioGroup from 'component/radio-group/RadioGroup.jsx'
import PalettePicker from '../PalettePicker.jsx'

import ChartWizardActions from 'actions/ChartWizardActions'
import builderDefinitions from 'stores/chartBuilder/builderDefinitions'

export default class GeneralOptions extends React.Component {
  constructor (props) {
    super(props)
  }

  static propTypes = {
    indicatorList: React.PropTypes.array,
    indicatorSelected: React.PropTypes.array,
    groupByValue: React.PropTypes.number,
    locationLevelValue: React.PropTypes.number,
    yFormatValue: React.PropTypes.number,
    palette: React.PropTypes.string
  }

  static defaultProps = {
    indicatorList: [],
    indicatorSelected: [],
    groupByValue: 0,
    locationLevelValue: 0,
    yFormatValue: 0,
    palette: ''
  }

  render () {
    return (
      <div className='chart-wizard__options chart-wizard__options--general'>
        <p className='chart-wizard__para'>You may choose additional indicators now.</p>
        <IndicatorDropdownMenu
          text='Add Indicators'
          icon='fa-plus'
          indicators={this.props.indicatorList}
          sendValue={ChartWizardActions.addIndicator} />
        <List items={this.props.indicatorSelected.slice(1)} removeItem={ChartWizardActions.removeIndicator} />

        <p className='chart-wizard__para'>You may also change additional chart settings.</p>
        <RadioGroup name='groupby' title='Group By: '
          value={this.props.groupByValue}
          values={builderDefinitions.groups}
          onChange={ChartWizardActions.changeGroupRadio} />
        <RadioGroup name='location-level' title='Location Level: '
          value={this.props.locationLevelValue}
          values={builderDefinitions.locationLevels}
          onChange={ChartWizardActions.changeLocationLevelRadio} />
        <RadioGroup name='format' title='Format: '
          value={this.props.yFormatValue}
          values={builderDefinitions.formats}
          onChange={ChartWizardActions.changeYFormatRadio} />
        <PalettePicker value={this.props.palette} onChange={ChartWizardActions.changePalette} />
      </div>
    )
  }
}
