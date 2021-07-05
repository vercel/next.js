import React from 'react'
import Link from 'next/link'

class MyLink extends React.Component {
  render() {
    return <a {...this.props}>Click me</a>
  }
}

const Class = () => (
  <Link href="/" passHref>
    <MyLink />
  </Link>
)

export default Class
