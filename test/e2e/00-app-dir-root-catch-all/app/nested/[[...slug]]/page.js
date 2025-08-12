import Link from 'next/link'

export default function Page(props) {
  return (
    <div>
      <p>catch-all {JSON.stringify(props.params || {})}</p>
      <Link href="/nested">Link to /</Link>
      <Link href="/nested/index">Link to /index</Link>
    </div>
  )
}

export function generateStaticParams() {
  return [
    {
      slug: [''],
    },
    // not supported
    // {
    //   slug: ['index'],
    // },
    {
      slug: ['first'],
    },
  ]
}

export const revalidate = 0
