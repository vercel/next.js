import Link from 'next/link'

export default function PageOne() {
  return (
    <div>
      <h1>Page One</h1>
      <Link href="/transition-types/page-two" transitionTypes={['slide']}>
        Go to Page Two (with slide)
      </Link>
      <Link href="/transition-types/page-two">Go to Page Two (no slide)</Link>
    </div>
  )
}
