// This page is written in flowtype to test Babel's functionality
import { React } from '../test/namespace-exported-react'

type Props = {}

export default class MyComponent extends React.Component<Props> {
  render() {
    return <div id="text">Test Babel</div>
  }
}
