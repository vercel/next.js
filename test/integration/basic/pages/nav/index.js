import Link from 'next/link'
import { Component } from 'react'

let counter = 0

const linkStyle = {
  marginRight: 10
}

export default class extends Component {
  increase () {
    counter++
    this.forceUpdate()
  }

  render () {
    return (
      <div className='nav-home'>
        <Link href='/nav/about'><a id='about-link' style={linkStyle}>About</a></Link>
        <Link href='/empty-get-initial-props'><a id='empty-props' style={linkStyle}>Empty Props</a></Link>
        <Link href='/nav/self-reload'><a id='self-reload-link' style={linkStyle}>Self Reload</a></Link>
        <Link href='/nav/shallow-routing'><a id='shallow-routing-link' style={linkStyle}>Shallow Routing</a></Link>
        <p>This is the home.</p>
        <div id='counter'>
          Counter: {counter}
        </div>
        <button id='increase' onClick={() => this.increase()}>Increase</button>
      </div>
    )
  }
}
