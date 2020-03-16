import React, { Component } from 'react'
import Head from 'next/head'
import { Col, Row, Grid } from 'react-bootstrap'

import Header from '../components/Header'
import DisplayForm from '../components/DisplayForm'

import UserForm from '../components/UserForm'
import Social from '../components/Social'

class Index extends Component {
  render() {
    return (
      <div>
        <Head>
          <title>Form Handler</title>
          <link
            rel="stylesheet"
            href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
            integrity="sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
            crossorigin="anonymous"
          />
        </Head>
        <Grid>
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
        </Grid>
      </div>
    )
  }
}

export default Index
