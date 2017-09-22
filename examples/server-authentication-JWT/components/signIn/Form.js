import React, {Component} from 'react'
import Link from 'next/link'
import { Col, Row, Button } from 'react-bootstrap'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { logIn } from '../../actions'
import SignForm from '../utils/SignForm'

class Form extends Component {
  logIn = () => {
    const { email, password } = this.props.formReducer.logIn
    const { logIn } = this.props
    const re = /\S+@\S+\.\S+/
    if (re.test(email)) {
      logIn(email, password)
    }
  }

  render () {
    return (
      <div>
        <Row style={{ marginTop: '40px' }}>
          <Col lg={10}>
            <Col lg={12} style={{ textAlign: 'center' }}>
              <h3>Sign In</h3>
            </Col>
            <SignForm title='logIn' />
            <Col lg={12} style={{ textAlign: 'center' }}>
              <Button type='submit' bsStyle='info' onClick={this.logIn}>
                Sign In
              </Button>
            </Col>
            <Col lg={12} style={{ marginTop: '20px', textAlign: 'center' }}>
              <Link href='/signUp'><a>Sign up</a></Link>
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

const mapDispatchToProps = dispatch => {
  return {
    logIn: bindActionCreators(logIn, dispatch)
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Form)
