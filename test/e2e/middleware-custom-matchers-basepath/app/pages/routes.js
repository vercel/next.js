import Link from 'next/link'

export default (props) => (
  <ul>
    <li>
      <Link href="/hello">
        <a id="hello">/hello</a>
      </Link>
    </li>
  </ul>
)
