import Link from 'next/link'

export default (props) => (
  <ul>
    <li>
      <Link href="/has-match-2?my-query=hellooo">
        <a id="has-match-2">has-match-2</a>
      </Link>
    </li>
    <li>
      <Link href="/has-match-3">
        <a id="has-match-3">has-match-3</a>
      </Link>
    </li>
  </ul>
)
