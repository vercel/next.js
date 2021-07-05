import React from 'react'
import Link from 'next/link'

class Button extends React.Component {
  render() {
    return <button {...this.props}>Click me</button>
  }
}

const InvalidRef = () => (
  <div>
    <Link href="/another">
      <Button id="btn-link" />
    </Link>
  </div>
)

export default InvalidRef
