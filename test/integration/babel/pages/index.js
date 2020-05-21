// This page is written in flowtype to test Babel's functionality
import * as React from 'react'

type Props = {}

export default class MyComponent extends React.Component<Props> {
  render() {
    return <div id="text">Test Babel</div>
  }
}
