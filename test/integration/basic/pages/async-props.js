import React from 'react'

export default class AsyncProps extends React.Component {
  static async getInitialProps () {
    return await fetchData()
  }

  render () {
    return <p>{this.props.name}</p>
  }
}

function fetchData () {
  const p = new Promise(resolve => {
    setTimeout(() => resolve({ name: 'Diego Milito' }), 10)
  })
  return p
}
