import Link from 'next/link'

export default () => {
  return (
    <div>
      <ul>
        <li>
          <Link href="/" prefetch>
            <a id="prefetch-1">index</a>
          </Link>
        </li>
        <li>
          <Link href="/process-env" prefetch>
            <a id="prefetch-2">process env</a>
          </Link>
        </li>
        <li>
          <Link href="/counter" prefetch>
            <a id="prefetch-3">counter</a>
          </Link>
        </li>
        <li>
          <Link href="/about" prefetch>
            <a id="prefetch-4">about</a>
          </Link>
        </li>
      </ul>
    </div>
  )
}
