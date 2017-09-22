import React from 'react'
import { Col } from 'react-bootstrap'
import Input from '../../handlers/Input'

export default (props) =>
  <div>
    <Col lg={12}>
      <Input placeholder='Email' type='email' title={props.title} name='email' />
    </Col>
    <Col lg={12}>
      <Input placeholder='Password' type='password' title={props.title} name='password' />
    </Col>
  </div>
