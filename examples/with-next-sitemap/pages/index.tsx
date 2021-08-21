import Link from 'next/link'

export default function HelloWorld() {
  return (
    <div>
      <h1>Hello World</h1>
      <ol>
        <li>
          <Link href="/page-1">
            <a>Link to dynamic page 1</a>
          </Link>
        </li>
        <li>
          <Link href="/page-2">
            <a>Link to dynamic page 2</a>
          </Link>
        </li>
        <li>
          <Link href="/page-3">
            <a>Link to dynamic page 3</a>
          </Link>
        </li>
        <li>
          <Link href="/page-4">
            <a>Link to dynamic page 4</a>
          </Link>
        </li>
        <li>
          <Link href="/page-5">
            <a>Link to dynamic page 5</a>
          </Link>
        </li>
      </ol>
    </div>
  )
}
