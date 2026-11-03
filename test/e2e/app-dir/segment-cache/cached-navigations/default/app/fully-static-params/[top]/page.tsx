import { LinkAccordion } from '../../../components/link-accordion'

export function generateStaticParams() {
  return [{ top: 't1' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ top: string }>
}) {
  const { top } = await params
  const timestamp = top === 'time' ? Date.now() : null

  return (
    <main>
      <p id="top">Top: {top}</p>
      <p id="timestamp">{timestamp}</p>
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
