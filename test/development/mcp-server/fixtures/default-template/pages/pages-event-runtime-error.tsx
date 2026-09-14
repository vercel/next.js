import Link from 'next/link'

export default function PagesEventRuntimeErrorPage() {
  return (
    <main>
      <button
        id="pages-event-error"
        onClick={() => {
          throw new Error('Test Pages event runtime error')
        }}
      >
        Trigger event error
      </button>
      <p id="pages-event-page-content">Page remains rendered</p>
      <Link id="pages-event-navigation" href="/pages-navigation-target">
        Navigate
      </Link>
    </main>
  )
}
