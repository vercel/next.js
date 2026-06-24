import Link from 'next/link'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          <Link id="link-all" href="/?color=red&color=green&color=blue">
            all
          </Link>
          <Link id="link-rb" href="/?color=red&color=blue">
            red+blue
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
