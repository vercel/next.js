import Link from 'next/link'

const HelloWorld = () => (
  <div>
    <h1>Hello World Page</h1>
    <ol>
      <li>
        <Link href="/[dynamic]" as="/page-1">
          <a>Link to dynamic page 1</a>
        </Link>
      </li>
      <li>
        <Link href="/[dynamic]" as="/page-2">
          <a>Link to dynamic page 2</a>
        </Link>
      </li>
      <li>
        <Link href="/[dynamic]" as="/page-3">
          <a>Link to dynamic page 3</a>
        </Link>
      </li>
      <li>
        <Link href="/[dynamic]" as="/page-4">
          <a>Link to dynamic page 4</a>
        </Link>
      </li>
      <li>
        <Link href="/[dynamic]" as="/page-5">
          <a>Link to dynamic page 5</a>
        </Link>
      </li>
    </ol>
  </div>
)

export default HelloWorld
