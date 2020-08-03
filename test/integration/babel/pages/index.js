// This page is written in flowtype to test Babel's functionality
import * as React from 'react'
import { Component } from '../test/namespace-exported-react'

type Props = {}

export default class MyComponent extends Component<Props> {
  render() {
    return <div id="text">Test Babel</div>
  }
}
