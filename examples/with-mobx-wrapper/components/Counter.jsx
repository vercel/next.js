import React from 'react'
import PropTypes from 'prop-types'
import {inject, observer} from 'mobx-react'

@inject(({counterStore: {count, increment, decrement}}) => ({
  count,
  increment,
  decrement
}))
@observer
class Counter extends React.Component {
  static propTypes = {
    count: PropTypes.number.isRequired,
    increment: PropTypes.func.isRequired,
    decrement: PropTypes.func.isRequired
  }

  render () {
    const {count, increment, decrement} = this.props
    return (
      <div>
        <div>
          Clicked: <strong>{count}</strong> times
        </div>
        <div>
          <button onClick={increment}>+</button>
          <button onClick={decrement}>-</button>
        </div>
      </div>
    )
  }
}

export default Counter
