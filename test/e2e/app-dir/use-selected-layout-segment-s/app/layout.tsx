import Link from 'next/link'
import RenderValues from './render-values'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head />
      <body>
        <RenderValues prefix="root" />
        <Link id="change-static" href="/segment-name/param1/different-segment">
          Change static
        </Link>
        <Link
          id="change-param"
          href="/segment-name/param1/segment-name2/different-value/value3/value4"
        >
          Change param
        </Link>
        <Link
          id="change-catchall"
          href="/segment-name/param1/segment-name2/value2/different/random/paths"
        >
          Change param
        </Link>
        {children}
      </body>
    </html>
  )
}
