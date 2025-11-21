import Link from 'next/link'

export default function Relative() {
  return (
    <div id="relative">
      On relative index
      <Link href="./relative-1" id="relative-1-link">
        To relative 1
      </Link>
    </div>
  )
}
