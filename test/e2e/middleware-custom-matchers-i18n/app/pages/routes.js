import Link from 'next/link'

export default (props) => (
  <ul>
    <li>
      <Link href="/hello" id="hello">
        /hello
      </Link>
    </li>
    <li>
      <Link href="/en/hello" id="en_hello">
        /en/hello
      </Link>
    </li>
    <li>
      <Link href="/nl-NL/hello" id="nl-NL_hello">
        /nl-NL/hello
      </Link>
    </li>
    <li>
      <Link href="/nl-NL/about" id="nl-NL_about">
        /nl-NL/about
      </Link>
    </li>
  </ul>
)
