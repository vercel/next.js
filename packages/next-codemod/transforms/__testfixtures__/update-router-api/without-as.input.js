import Router from 'next/router'
import Link from 'next/link'

export default class extends React.Component {
  onClick = e => {
    Router.push('/url')
  }
  render() {
    return (
      <div>
        <button onClick={this.onClick}>
          Test
        </button>
        <Link href="/url">
          Test 2
        </Link>
      </div>
    )
  }
}
