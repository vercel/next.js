import { Component } from 'react'
import Link from 'next/link'
import Editor from '../components/NextEditor'

class MultipleEditors extends Component {
  render() {
    return (
      <>
        <Link href="/">
          <a>Go to Home</a>
        </Link>
        <hr />
        <Editor slateKey="foo" defaultValue="Foo" />
        <hr />
        <Editor slateKey="bar" defaultValue="Bar" />
      </>
    )
  }
}

export default MultipleEditors
