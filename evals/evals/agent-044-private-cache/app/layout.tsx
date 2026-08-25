import { Suspense } from 'react'
import { getRecommendations } from '../lib/recommendations'

async function RecommendationsBadge() {
  const recs = await getRecommendations()
  return <span id="rec-badge">{recs.length} picks for you</span>
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <header>
          <Suspense fallback={<span>…</span>}>
            <RecommendationsBadge />
          </Suspense>
        </header>
        {children}
      </body>
    </html>
  )
}
