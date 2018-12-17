import React, { Component } from 'react'
import Head from 'next/head'
import { Col, Row } from 'react-bootstrap'

import Header from './Header'
import DisplayForm from './DisplayForm'

import UserForm from './UserForm'
import Social from './Social'

class Main extends Component {
  render () {
    return (
      <div>
        <Head>
          <title>Form Handler</title>
          <link
            rel='stylesheet'
            href='https://maxcdn.bootstrapcdn.com/bootstrap/latest/css/bootstrap.min.css'
          />
        </Head>
        <Header />
        <DisplayForm />
        <Row>
          <Col lg={6}>
            <UserForm />
          </Col>
          <Col lg={6}>
            <Social />
          </Col>
        </Row>
      </div>
    )
  }
}

export default Main
