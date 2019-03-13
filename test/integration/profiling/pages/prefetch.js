import Link from 'next/link'

export default () => {
  return <div>
    <ul>
      <li>
        <Link href='/' prefetch>
          <a>index</a>
        </Link>
      </li>
      <li>
        <Link href='/process-env' prefetch>
          <a>process env</a>
        </Link>
      </li>
      <li>
        <Link href='/counter' prefetch>
          <a>counter</a>
        </Link>
      </li>
      <li>
        <Link href='/about' prefetch>
          <a>about</a>
        </Link>
      </li>
    </ul>
  </div>
}
