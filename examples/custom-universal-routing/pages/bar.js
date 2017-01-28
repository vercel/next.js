import React from 'react'
import Link from '../components/link'

export default class Bar extends React.Component {
  render () {
    return <div>
      <h1>About (Bar Template)</h1>
      <div>Click <Link href='/'><a>here</a></Link> to go back home.</div>
    </div>
  }
}
