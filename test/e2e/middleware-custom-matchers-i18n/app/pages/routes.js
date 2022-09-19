import Link from 'next/link'

export default (props) => (
  <ul>
    <li>
      <Link href="/hello">
        <a id="hello">/hello</a>
      </Link>
    </li>
    <li>
      <Link href="/en/hello">
        <a id="en_hello">/en/hello</a>
      </Link>
    </li>
    <li>
      <Link href="/nl-NL/hello">
        <a id="nl-NL_hello">/nl-NL/hello</a>
      </Link>
    </li>
    <li>
      <Link href="/nl-NL/about">
        <a id="nl-NL_about">/nl-NL/about</a>
      </Link>
    </li>
  </ul>
)
