import Link from 'next/link'

export default function PageTwo() {
  return (
    <div>
      <h1>Page Two</h1>
      <Link href="/transition-types" transitionTypes={['slide']}>
        Back to Page One (with slide)
      </Link>

      <Link href="/transition-types">Back to Page One (no slide)</Link>
    </div>
  )
}
