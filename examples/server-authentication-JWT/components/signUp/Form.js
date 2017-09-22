import React, {Component} from 'react'
import Link from 'next/link'
import { Col, Row, Button } from 'react-bootstrap'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { createUser } from '../../actions'
import SignForm from '../utils/SignForm'

class Form extends Component {
  createCompany = () => {
    const { createUser } = this.props
    const { name, email, password } = this.props.formReducer.signUp
    const re = /\S+@\S+\.\S+/
    if (re.test(email)) {
      createUser(name, email, password)
    }
  }

  render () {
    return (
      <div>
        <Row style={{ marginTop: '40px' }}>
          <Col lg={10}>
            <Col lg={12} style={{ textAlign: 'center' }}>
              <h3>Sign Up</h3>
            </Col>
            <SignForm title='signUp' />
            <Col lg={12} style={{ textAlign: 'center' }}>
              <Button type='submit' bsStyle='info' onClick={this.createCompany}>
                Sign Up
              </Button>
            </Col>
            <Col lg={12} style={{ marginTop: '20px', textAlign: 'center' }}>
              <Link href='/'><a>Sign In</a></Link>
            </Col>
          </Col>
        </Row>
      </div>
    )
  }
}

const mapStateToProps = ({ formReducer }) => {
  return {
    formReducer
  }
}

const mapDistpatchToProps = dispatch => {
  return {
    createUser: bindActionCreators(createUser, dispatch)
  }
}

export default connect(mapStateToProps, mapDistpatchToProps)(Form)
