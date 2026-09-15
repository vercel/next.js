import { LinkAccordion } from '../components/link-accordion'

export default function HomePage() {
  return (
    <div>
      <div id="home-page">Home</div>
      {/*
        Revealing this link prefetches /docs — the fully static index of the
        optional catch-all route. That prefetch is what used to poison the
        param-wildcard slot for every other slug.
      */}
      <LinkAccordion href="/docs">Docs index</LinkAccordion>
    </div>
  )
}
