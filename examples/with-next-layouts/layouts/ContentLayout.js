import React from 'react'
import delay from '../modules/delay'
import AppLayout from './AppLayout'

export default class ContentLayout extends React.Component {
  static parentLayout = AppLayout
  static async getInitialProps () {
    return {
      delay: await delay(2000)
    }
  }

  render () {
    return (
      <div>
        <hr />
        {this.props.children}
        <hr />
      </div>
    )
  }
}
