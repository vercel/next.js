import React from 'react'
import Router from 'next/router'
import { Col, Thumbnail, Button } from 'react-bootstrap'

const handler = route =>
  Router.push({
    pathname: `/${route}`
  })

export default () =>
  <div>
    <div style={{ marginTop: '20px' }}>
      <Col lg={4} lgOffset={2}>
        <Thumbnail>
          <h3>Profile</h3>
          <p>
            <Button bsStyle='primary' onClick={() => handler('profile')}>Go</Button>
          </p>
        </Thumbnail>
      </Col>
      <Col lg={4}>
        <Thumbnail>
          <h3>Other view</h3>
          <p>
            <Button bsStyle='primary' onClick={() => handler('other')}>Go</Button>
          </p>
        </Thumbnail>
      </Col>
    </div>
  </div>
