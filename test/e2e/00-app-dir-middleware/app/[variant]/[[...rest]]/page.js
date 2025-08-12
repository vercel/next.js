import Link from 'next/link'

const paths = ['/', '/shop', '/product', '/who-we-are', '/about', '/contact']

export default function Page({ params }) {
  return (
    <>
      <p>variant: {params.variant}</p>
      <p>slug: {params.rest?.join('/')}</p>
      <ul>
        {paths.map((path) => {
          return (
            <li key={path}>
              <Link href={path}>to {path}</Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
