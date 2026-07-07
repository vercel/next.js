import Link from 'next/link'
const invalidLink = 'https://'

export default function Page() {
  return (
    <Link href={invalidLink} id="click-me">
      invalid link :o
    </Link>
  )
}
