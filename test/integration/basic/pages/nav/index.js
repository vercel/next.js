import Link from 'next/link'
import { Component } from 'react'

let counter = 0

export default class extends Component {

  increase () {
    counter++
    this.forceUpdate()
  }

  render () {
    return (
      <div className='nav-home'>
        <Link href='/nav/about'>About</Link>
        <p>This is the home.</p>
        <div id='counter'>
          Counter: {counter}
        </div>
        <button id='increase' onClick={() => this.increase()}>Increase</button>
      </div>
    )
  }
}
