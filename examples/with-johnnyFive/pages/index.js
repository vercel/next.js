import { Component } from 'react'
import io from 'socket.io-client'
import fetch from 'isomorphic-fetch'

class HomePage extends Component {
  // init state with the prefetched messages
  state = {
    ledState: 0
  }

  // connect to WS server and listen event
  componentDidMount () {
    this.socket = io('http://localhost:3000/')    
  }

  handleLed(state) {
    this.socket.emit('led', state)
  }

  render () {
    return (
      <main>
        <div>
          <button onClick={() => this.handleLed(1)}>ON</button>
          <button onClick={() => this.handleLed(0)}>OFF</button>
        </div>
      </main>
    )
  }
}

export default HomePage
