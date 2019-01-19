import React, { Component } from 'react'
import { Col, Row } from 'react-bootstrap'
import { connect } from 'react-redux'

class DisplayForm extends Component {
  render () {
    const { state } = this.props
    return (
      <div>
        <Row>
          <Col lg={8} lgOffset={2}>
            <pre>{JSON.stringify(state, null, 2)}</pre>
          </Col>
        </Row>
      </div>
    )
  }
}

const mapStateToProps = state => {
  return {
    state
  }
}

export default connect(mapStateToProps)(DisplayForm)
