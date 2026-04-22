import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function GetStaticPropsRewritePage() {
  const { query } = useRouter()

  useEffect(() => {
    window.__getStaticPropsRewriteRenders ??= []
    window.__getStaticPropsRewriteRenders.push(query.foo)
  })

  return (
    <p>
      A getStaticProps page should record rewrite query params across renders.
    </p>
  )
}

export function getStaticProps() {
  return {
    props: {},
  }
}
