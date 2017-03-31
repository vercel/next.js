
import { Component } from 'react'
import Link from 'next/link'

export default class Movies extends Component {
  constructor (props) {
    super(props)
    this.state = {}
  }

  render (props) {
    return (
      <div>
        <h2>Some of my favorite movies</h2>
        <Link href='/'><a>Go Back to Index</a></Link>
      </div>
    )
  }
}
