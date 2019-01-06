import { Container } from 'unstated'

export default class CounterContainer extends Container {
  state = {
    count: 0
  }

  increment = () => {
    this.setState(state => ({ count: state.count + 1 }))
  }

  decrement = () => {
    this.setState(state => ({ count: state.count - 1 }))
  }

  reset = () => {
    this.setState({ count: 0 })
  }

  // this two method is not setState as it work only before rendering
  initState = (count) => {
    this.state = { count }
  }
  resetState = () => {
    this.initState(0)
  }
}
export const counterStore = new CounterContainer()


