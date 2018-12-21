import * as React from 'react'
import Link from 'next/link'

export default class About extends React.Component {
  state = { name: '' };

  async componentDidMount () {
    const name = await window.getName()
    this.setState({ name })
  }

  render () {
    return (
      <div>
        <p>About {this.state.name}</p>

        <Link href='/'>
          <a>back</a>
        </Link>
      </div>
    )
  }
}
