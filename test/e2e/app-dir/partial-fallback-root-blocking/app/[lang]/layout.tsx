import { Suspense, type ReactNode } from 'react'

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

async function LayoutImpl({ children, params }: LayoutProps) {
  const { lang } = await params

  return (
    <html>
      <body>
        <div id="lang">{lang}</div>
        {children}
      </body>
    </html>
  )
}

export default async function LayoutWrapper(props: LayoutProps) {
  return (
    <Suspense
      fallback={
        <html>
          <body>
            <div id="lang-fallback" data-fallback>
              loading lang...
            </div>
          </body>
        </html>
      }
    >
      <LayoutImpl {...props} />
    </Suspense>
  )
}
