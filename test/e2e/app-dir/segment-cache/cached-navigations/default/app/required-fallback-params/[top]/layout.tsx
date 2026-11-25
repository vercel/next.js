import type { ReactNode } from 'react'
import { LinkAccordion } from '../../../components/link-accordion'

export function generateStaticParams() {
  return [{ top: 't1' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ top: string }>
}) {
  const { top } = await params

  return (
    <main>
      <p id="top">Top: {top}</p>
      {children}
      {['a', 'b'].map((step) => (
        <div key={step}>
          <LinkAccordion
            href={`/fallback-params-hub/${top}/${step}`}
            prefetch={false}
          >
            Hub {step}
          </LinkAccordion>
        </div>
      ))}
    </main>
  )
}
