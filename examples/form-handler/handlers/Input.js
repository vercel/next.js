import React, { Component } from 'react'
import { FormGroup, ControlLabel, FormControl } from 'react-bootstrap'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'

import { inputChange } from '../actions'

class Input extends Component {
  inputChange = e => {
    const { inputChange, title, name } = this.props
    inputChange(title, name, e.target.value)
  }

  render () {
    return (
      <div>
        <FormGroup controlId='formBasicText'>
          <ControlLabel>{this.props.controlLabel}</ControlLabel>
          <FormControl
            disabled={this.props.disabled}
            type={this.props.type || 'Text'}
            placeholder={this.props.controlLabel}
            onChange={this.inputChange}
            value={this.props.val}
          />
        </FormGroup>
      </div>
    )
  }
}

const mapDispatchToProps = dispatch => {
  return {
    inputChange: bindActionCreators(inputChange, dispatch)
  }
}

export default connect(
  null,
  mapDispatchToProps
)(Input)
