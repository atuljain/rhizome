import React from 'react'
import _ from 'lodash'

export default React.createClass({
  propTypes: {
    values: React.PropTypes.array.isRequired,
    name: React.PropTypes.string.isRequired,
    sendValue: React.PropTypes.func.isRequired
  },

  _handleChange: function (event) {
    this.props.onChange(event.target.value)
  },

  getInitialState: function () {
    return {selected: []}
  },

  _handleChange: function (e) {
    if(e.target.checked) {
      let wrapped = _(this.state.selected).push(e.target.value);
      wrapped.commit();
    } else {
      this.state.selected = _.reject(this.state.selected, (ele) => ele === '' + e.target.value)
    }
    this.props.sendValue(this.state.selected)
  },
  render: function () {
    let checkBoxes = this.props.values.map((checkbox, index) => {
      return (
        <div key={checkbox.value}>
          <input type='checkbox' name={this.props.name} id={checkbox.title}
            value={checkbox.value}
            refer='sub-location'
            onChange={this._handleChange}
          />
          <label htmlFor={checkbox.title}>{checkbox.title}</label>
        </div>
      )
    })
    return (
      <div className='check-box-group-container'>
        {checkBoxes}
      </div>)
  }
})
