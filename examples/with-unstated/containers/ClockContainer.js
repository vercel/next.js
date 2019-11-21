import { Container } from 'unstated'

export default class ClockContainer extends Container {
  state = {
    lastUpdate: 0,
    light: false,
  }
  constructor() {
    super()
    this.interval = setInterval(() => {
      this.setState(state => ({ light: !state.light, lastUpdate: Date.now() }))
    }, 1000)
  }
}
