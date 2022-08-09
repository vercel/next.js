import Link from 'next/link'

export default (props) => (
  <ul>
    <li>
      <Link href="/hello">
        <a id="hello">/hello</a>
      </Link>
    </li>
    <li>
      <Link href="/about">
        <a id="about">/about</a>
      </Link>
    </li>
  </ul>
)
