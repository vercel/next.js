import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Index() {
  const { query } = useRouter()

  useEffect(() => {
    window.__renders = window.__renders || []
    window.__renders.push(query.foo)
  })

  return <p>A page should not be rerendered if unnecessary.</p>
}
