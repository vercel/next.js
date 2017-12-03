import React from 'react'
import withSentry from '../components/withSentry'

class Index extends React.Component {
  static getInitialProps (context) {
    const { isServer } = context
    return { isServer }
  }

  onClickHandler () {
    throw new Error('woops')
  }

  render () {
    return (
      <div>
        <h2>Index page</h2>

        <button onClick={this.onClickHandler.bind(this)}>Click to raise error</button>
      </div>
    )
  }
}

export default withSentry(Index)
