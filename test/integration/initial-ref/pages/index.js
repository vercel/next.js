import React from 'react'

class App extends React.Component {
  constructor() {
    super()

    this.divRef = React.createRef()

    this.state = {
      refHeight: 0,
    }
  }

  componentDidMount() {
    const refHeight = this.divRef.current.clientHeight
    this.setState({ refHeight })
  }

  render() {
    const { refHeight } = this.state

    return (
      <div ref={this.divRef} style={{ height: 76, overflow: 'hidden' }}>
        <h1>DOM Ref test using 9.2.0</h1>
        <code id="ref-val">{`this component is ${refHeight}px tall`}</code>
      </div>
    )
  }
}

export default App
