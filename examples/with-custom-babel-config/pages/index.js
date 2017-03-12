import React from 'react'

export default class MyLuckNo extends React.Component {
  constructor (...args) {
    super(...args)
    this.state = { randomNo: null }
  }

  componentDidMount () {
    this.recalculate()
  }

  recalculate () {
    this.setState({
      randomNo: Math.ceil(Math.random() * 100)
    })
  }

  render () {
    const { randomNo } = this.state

    if (randomNo === null) {
      return (<p>Please wait..</p>)
    }

    // This is an experimental JavaScript feature where we can get with
    // using babel-preset-stage-0
    const message = do {
      if (randomNo < 30) {
        // eslint-disable-next-line no-unused-expressions
        'Do not give up. Try again.'
      } else if (randomNo < 60) {
        // eslint-disable-next-line no-unused-expressions
        'You are a lucky guy'
      } else {
        // eslint-disable-next-line no-unused-expressions
        'You are soooo lucky!'
      }
    }

    return (
      <div>
        <h3>Your Lucky number is: "{randomNo}"</h3>
        <p>{message}</p>
        <button onClick={() => this.recalculate()}>Try Again</button>
      </div>
    )
  }
}
