import Router from 'next/router'
import Link from 'next/link'

export default class extends React.Component {
  onClick = e => {
    Router.push('/url/href')
  }
  render() {
    return (
      <div>
        <button onClick={this.onClick}>
          Test
        </button>
        <Link href="/url/href">
          Test 2
        </Link>
      </div>
    )
  }
}
