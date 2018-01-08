import React from 'react'
import Link from 'next/link'
import AppLayout from '../components/AppLayout'

export default class IndexPage extends React.Component {
  static layout = AppLayout

  render () {
    return (
      <div>
        index
        <Link href='/about'>
          <a>about</a>
        </Link>
      </div>
    )
  }
}
