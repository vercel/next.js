import { LinkAccordion } from '../../components/link-accordion'

export default function Page() {
  return (
    <div id="scroll-false-source-page">
      <h1>Scroll false source page</h1>
      {/* Tall spacer so that the link is only reachable by scrolling. */}
      <div style={{ height: 3000 }} />
      <LinkAccordion
        href="/scroll-false-mismatch/dynamic-page/a?mismatch-rewrite=./b"
        scroll={false}
      />
      <div style={{ height: 1500 }} />
    </div>
  )
}
