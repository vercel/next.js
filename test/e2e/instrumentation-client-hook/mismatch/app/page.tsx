import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <div>
      <h1 id="home">Home</h1>
      <LinkAccordion href="/dynamic-page/a?mismatch-rewrite=./b">
        <code>{`/dynamic-page/a ──[ rewrites to ]──→ /dynamic-page/b`}</code>
      </LinkAccordion>
    </div>
  )
}
