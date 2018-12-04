import { Container } from 'unstated'

class DataContainer extends Container {
  state = {}
  insertData = (data) => {
    this.setState(data)
  }
  getData = () => this.state
}

export { DataContainer }
