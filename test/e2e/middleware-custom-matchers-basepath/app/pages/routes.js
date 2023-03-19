import Link from 'next/link'

export default (props) => (
  <ul>
    <li>
      <Link href="/hello" id="hello">
        /hello
      </Link>
    </li>
  </ul>
)
