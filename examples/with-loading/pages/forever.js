import React, { Component } from 'react'
import Header from '../components/Header'

export default class Forever extends Component {
  // Add some delay
  static getInitialProps () {
    return new Promise((resolve) => {
      setTimeout(resolve, 3000)
    })
  }

  render () {
    return (
      <div>
        <Header />
        <p>This page was rendered for a while!</p>
      </div>
    )
  }
}
