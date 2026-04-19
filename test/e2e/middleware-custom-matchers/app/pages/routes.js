import Link from 'next/link'

export default (props) => (
  <ul>
    <li>
      <Link href="/has-match-2?my-query=hellooo" id="has-match-2">
        has-match-2
      </Link>
    </li>
    <li>
      <Link href="/has-match-3" id="has-match-3">
        has-match-3
      </Link>
    </li>
  </ul>
)
