import Link from 'next/link'

export default function Relative1() {
  return (
    <div id="relative-1">
      On relative 1<Link href="./relative-2">To relative 2</Link>
    </div>
  )
}
