import React from 'react'
import delay from '../modules/delay'

export default class AppLayout extends React.Component {
  static async getInitialProps () {
    return {
      delay: await delay(1000)
    }
  }

  render () {
    return (
      <div>
        <h1>App header</h1>
        {this.props.children}
      </div>
    )
  }
}
