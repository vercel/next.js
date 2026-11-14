import { useEffect, useState } from 'react'
import Router from 'next/router'

export async function getServerSideProps({ locale }) {
  return {
    props: {
      locale,
      renderedAt: Date.now(),
    },
  }
}

export default function GsspPage({ locale, renderedAt }) {
  const [log, setLog] = useState([])
  const [popstateCount, setPopstateCount] = useState(0)

  useEffect(() => {
    const onStart = (url) => setLog((prev) => [...prev, `start:${url}`])
    Router.events.on('routeChangeStart', onStart)

    const onPopState = () => setPopstateCount((c) => c + 1)
    window.addEventListener('popstate', onPopState)

    return () => {
      Router.events.off('routeChangeStart', onStart)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  return (
    <div>
      <p id="page-type">gssp</p>
      <p id="locale">{locale}</p>
      <p id="rendered-at">{renderedAt}</p>
      <p id="popstate-count">{popstateCount}</p>
      <p id="log">log:{log.join(',')}</p>
      <button
        id="push-state"
        onClick={() => {
          window.history.pushState(
            null,
            '',
            `${window.location.pathname}/modal`
          )
        }}
      >
        Push
      </button>
      <button
        id="go-back"
        onClick={() => {
          window.history.back()
        }}
      >
        Back
      </button>
    </div>
  )
}
