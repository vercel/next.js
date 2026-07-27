import Link from 'next/link'

export default () => {
  return (
    <div>
      <ul>
        <li>
          <Link href="/" prefetch id="prefetch-1">
            index
          </Link>
        </li>
        <li>
          <Link href="/process-env" prefetch id="prefetch-2">
            process env
          </Link>
        </li>
        <li>
          <Link href="/counter" prefetch id="prefetch-3">
            counter
          </Link>
        </li>
        <li>
          <Link href="/about" prefetch id="prefetch-4">
            about
          </Link>
        </li>
      </ul>
    </div>
  )
}
