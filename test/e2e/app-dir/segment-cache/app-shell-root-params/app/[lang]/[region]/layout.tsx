import { lang } from 'next/root-params'
import { ReactNode } from 'react'

// This is the topmost layout in the route tree (there is no app/layout.tsx
// above it), so both `lang` and `region` are "root params" (params at or above
// the root layout), accessible via next/root-params.
//
// Crucially, the layout — which is part of the App Shell — reads ONLY `lang`,
// never `region`. So the shell varies on `lang` but is identical across
// `region` values.
export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const currentLang = await lang()
  return (
    <html lang={currentLang}>
      <body>
        <div id="shell-lang">{`Shell lang: ${currentLang}`}</div>
        {children}
      </body>
    </html>
  )
}

// Only one combo is statically generated — just enough to give the app a
// buildable start page (/en/us). The combos the test probes are deliberately
// NOT listed here, so their shells are rendered at runtime (FetchStrategy.
// RuntimeShell). A statically-prerendered shell would be cached via a different
// code path that already narrows by the server-reported vary params, masking
// the runtime-shell keying we're exercising here.
export function generateStaticParams() {
  return [{ lang: 'en', region: 'us' }]
}
