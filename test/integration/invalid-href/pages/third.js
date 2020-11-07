import Link from 'next/link'
const invalidLink = 'https://'

export default function Page() {
  return (
    <Link href={invalidLink}>
      <a id="click-me">invalid link :o</a>
    </Link>
  )
}
