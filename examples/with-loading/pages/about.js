import React, { Component } from 'react'
import Header from '../components/Header'

export default class About extends Component {
  // Add some delay
  static async getInitialProps () {
    await new Promise((resolve) => {
      setTimeout(resolve, 500)
    })
    return {}
  }

  render () {
    return (
      <div>
        <Header />
        <p>This is about Next!</p>
      </div>
    )
  }
}
