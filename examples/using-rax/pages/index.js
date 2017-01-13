import React from 'react'
import Link from 'next/prefetch'

export default class extends React.Component {
  constructor (...args) {
    super(...args)
    this.state = { count: 0 }
  }

  componentDidMount () {
    this.handler = setInterval(() => {
      const { count } = this.state
      this.setState({ count: count + 1 })
    }, 500)
  }

  componentWillUnmount () {
    clearTimeout(this.handler)
  }

  render () {
    const { count } = this.state
    return (
      <div>
        <p>This is the index page. Counter is: {count}</p>
        <Link href='/about'>About Page</Link>
      </div>
    )
  }
}
