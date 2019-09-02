import React from 'react'
import Link from 'next/link'
import Editor from '../components/NextEditor'

class MultipleEditors extends React.Component {
  render () {
    return (
      <React.Fragment>
        <Link href='/'>
          <a>Go to Home</a>
        </Link>
        <hr />
        <Editor slateKey='foo' defaultValue='Foo' />
        <hr />
        <Editor slateKey='bar' defaultValue='Bar' />
      </React.Fragment>
    )
  }
}

export default MultipleEditors
