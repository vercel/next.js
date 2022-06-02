import Reflux from 'reflux'
import CounterStore from '../store/counterStore'
import Actions from '../actions/actions'

export default class Home extends Reflux.Component {
  constructor() {
    super()
    this.store = CounterStore
  }
  render() {
    return (
      <div>
        <h1>Counter Value: {this.state.counter}</h1>
        <button onClick={Actions.increment}>Increment</button>
        <button onClick={Actions.decrement}>Decrement</button>
      </div>
    )
  }
}
