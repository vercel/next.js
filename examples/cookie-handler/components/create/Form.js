import React, {Component} from 'react'
import { Button } from 'react-bootstrap'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { createName } from '../../actions'
import Input from '../../handlers/Input'

const wellStyles = { maxWidth: 400, margin: '0 auto 10px' }

class Form extends Component {
  createName = () => {
    const { name } = this.props.formReducer.create
    const { createName } = this.props
    createName(name)
  }

  render () {
    return (
      <div>
        <div className="well" style={wellStyles}>
          <Input placeholder='Name' title='create' name='name' />
          <Button type="submit" bsStyle="info" bsSize="large" onClick={this.createName} block>
            Create Name
          </Button>
        </div>
      </div>
    )
  }
}

const mapStateToProps = ({ formReducer }) => {
  return {
    formReducer
  }
} 

const mapDispatchToProps = dispatch => {
  return {
    createName: bindActionCreators(createName, dispatch)
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Form)
