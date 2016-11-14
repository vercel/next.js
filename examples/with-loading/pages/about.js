import React, { Component } from 'react'
import Header from '../components/header.js'

export default class About extends Component {
  // Add some delay to the loading page
  static getInitialProps () {
    return new Promise((resolve) => {
      setTimeout(resolve, 500)
    })
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
