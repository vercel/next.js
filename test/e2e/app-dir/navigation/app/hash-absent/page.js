import Link from 'next/link'

// Fixture for navigating to a hash whose target is not present in the DOM.
// The links are position: fixed so that clicking one never scrolls the
// viewport to bring it into view — that way the test observes only the
// router's own scroll behavior, not the browser's click-into-view scroll.
export default function HashAbsentPage() {
  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: '16px' }}>
      <p>Hash Absent Page</p>
      <nav style={{ position: 'fixed', top: 0, left: 0, zIndex: 1 }}>
        <Link href="#present-target" id="link-to-present">
          to present target
        </Link>{' '}
        <Link href="#ghost-target" id="link-to-ghost">
          to absent target
        </Link>
      </nav>
      <div style={{ height: '150vh' }} />
      <h2 id="present-target">Present target</h2>
      <div style={{ height: '150vh' }} />
    </div>
  )
}
