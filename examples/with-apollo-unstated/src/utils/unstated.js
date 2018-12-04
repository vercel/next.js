import { Container } from 'unstated'

class dataContainer extends Container {
  state = {}
  insertData = (data) => {
    this.setState(data)
  }
  getData = () => this.state
}

export { dataContainer }
