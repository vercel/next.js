import React from 'react'
import withApp from '../components/withApp'

class Index extends React.Component {
  static getInitialProps (context) {
    const { isServer } = context
    return { isServer }
  }
  render () {
    const { greeting } = this.props
    return (
      <div>
        <h2>Index page</h2>
        <h3 style={{ color: 'red' }}>{greeting}</h3>
      </div>
    )
  }
}

export default withApp(Index)
