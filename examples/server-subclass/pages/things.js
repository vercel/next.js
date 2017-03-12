import { Component } from 'react'
import Link from 'next/link'

export default class Things extends Component {
  render () {
    const id = parseInt(this.props.url.query.id, 10)
    const nextThing = id + 1
    return (
      <div>
        <h2>Welcome to Thing {id}</h2>
        <Link href={`/things?id=${nextThing}`} as={`/things/${nextThing}`}>
          <a>Thing {nextThing}</a>
        </Link>
      </div>
    )
  }
}
