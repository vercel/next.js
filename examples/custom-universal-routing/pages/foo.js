import React from 'react'
import Link from '../components/link'

export default class Foo extends React.Component {
  render () {
    return <div>
      <h1>Home (Foo Template)</h1>
      <div>Click <Link href='/about'><a>here</a></Link> to see the about page.</div>
    </div>
  }
}
