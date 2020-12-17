import Link from 'next/link'

export default class extends React.Component {
  render() {
    return (
      <Link as="/url/as" href="/url/href">
        Test
      </Link>
    )
  }
}
