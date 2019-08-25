import React, { Component } from 'react'
import withStomp from '../withStomp'

class StockPrice extends Component {
  render () {
    const { message } = this.props

    // Check inside The message
    console.log('##### new message : ', message)

    return (
      <div>
        <h3>New Message:</h3>
        <p>{message.text}</p>
      </div>
    )
  }
}

export default withStomp('/any/topic')(StockPrice)
