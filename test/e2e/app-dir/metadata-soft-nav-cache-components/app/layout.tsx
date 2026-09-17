import { headers } from 'next/headers'
import { ReactNode, Suspense } from 'react'

export const metadata = {
  // The root layout provides a default title and a template. While a child
  // route's dynamic metadata is still streaming in, the title should fall back
  // to this default (or retain the previous route's title) — it must never be
  // dropped to an empty string (which makes the browser tab show the URL).
  title: { default: 'Home Default', template: '%s | Site' },
}

async function DynamicLayoutContent() {
  await headers()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <p id="dynamic-layout-content">Dynamic layout content</p>
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<p id="dynamic-layout-fallback">loading…</p>}>
          <DynamicLayoutContent />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
