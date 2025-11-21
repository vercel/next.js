import React from 'react'
import Link from 'next/link'

class MyLink extends React.Component {
  render() {
    return <span {...this.props}>Click me</span>
  }
}

export default () => (
  <Link href="/">
    <MyLink />
  </Link>
)
