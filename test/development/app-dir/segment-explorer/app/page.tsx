import Link from 'next/link'

const hrefs = [
  '/parallel-routes',
  '/blog/~/grid',
  '/soft-navigation/a',
  '/file-segments',
  '/parallel-default',
  '/parallel-default/subroute',
]

export default function Page() {
  return (
    <div>
      <h1>Segment Explorer</h1>
      <p>Examples</p>
      <div>
        {hrefs.map((href) => (
          <div key={href}>
            <Link href={href}>{href}</Link>
          </div>
        ))}
      </div>
    </div>
  )
}
