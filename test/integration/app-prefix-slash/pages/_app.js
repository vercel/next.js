import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <Link href={`add-prefix-slash`}>
        <a id="add-prefix-slash">Add prefix slash</a>
      </Link>
    </div>
  )
}
