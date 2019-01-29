import React from 'react'

export default class InstanceInitialPropsPage extends React.Component {
  async getInitialProps () {
    return fetchData()
  }

  render () {
    return <p>{this.props.name}</p>
  }
}

function fetchData () {
  const p = new Promise(resolve => {
    setTimeout(() => resolve({ name: 'Anderson Leite' }), 10)
  })
  return p
}
