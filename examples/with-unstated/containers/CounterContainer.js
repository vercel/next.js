import { Container } from 'unstated'

export default class CounterContainer extends Container {
  state = {
    count: 0
  }

  increment = () => {
    this.setState({ count: this.state.count + 1 })
  }

  decrement = () => {
    this.setState({ count: this.state.count - 1 })
  }

  reset = () => {
    this.setState({ count: 0 })
  }
}
