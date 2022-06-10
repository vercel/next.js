import { useEffect } from 'react'
import Router, { useRouter } from 'next/router'

Router.events.on('routeChangeComplete', (url) => {
  window.__route_change_complete = url === '/'
})

export default function Index() {
  const { query } = useRouter()

  useEffect(() => {
    window.__renders = window.__renders || []
    window.__renders.push(query.foo)
  })

  return <p>A page should not be rerendered if unnecessary.</p>
}
