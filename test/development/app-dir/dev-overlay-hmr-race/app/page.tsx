import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/instant-validation-error" prefetch={false}>
          instant validation error
        </Link>
      </li>
      <li>
        <Link href="/replayed-console-error" prefetch={false}>
          replayed console error
        </Link>
      </li>
    </ul>
  )
}
