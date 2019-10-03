import React, { Component } from 'react'

/* First we will make a new context */
const CounterContext = React.createContext()

/* Then create a provider Component */
class CounterProvider extends Component {
  state = {
    count: 0,
    increase: () => {
      this.setState((state, props) => ({
        count: state.count + 1
      }))
    },
    increaseBy: val => {
      this.setState((state, props) => ({
        count: state.count + val
      }))
    },
    decrease: () => {
      this.setState((state, props) => ({
        count: state.count - 1
      }))
    }
  }

  render () {
    return (
      <CounterContext.Provider value={this.state}>
        {this.props.children}
      </CounterContext.Provider>
    )
  }
}

/* then make a consumer which will surface it */
const CounterConsumer = CounterContext.Consumer

export default CounterProvider
export { CounterConsumer }
