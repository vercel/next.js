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
        {children}
      </body>
    </html>
  )
}
