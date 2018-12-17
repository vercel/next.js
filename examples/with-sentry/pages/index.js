import React from 'react'

class Index extends React.Component {
  state = {
    raiseError: false
  }

  componentDidUpdate () {
    if (this.state.raiseError) {
      throw new Error('Houston, we have a problem')
    }
  }

  raiseError = () => this.setState({ raiseError: true })

  render () {
    return (
      <div>
        <h2>Index page</h2>
        <button onClick={this.raiseError}>Click to raise the error</button>
      </div>
    )
  }
}

export default Index
