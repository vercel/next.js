import { useRouter } from 'next/router'

function hasMiddlewareMatched(slug) {
  const values =
    (typeof document !== 'undefined' ? document.cookie : '')
      .split(';')
      .map((pair) => pair.split('='))
      .filter(([key]) => key === 'middleware-slug')
      .map(([, value]) => value.trim()) ?? []
  return values.some((value) => value === slug?.join('/'))
}

export const ContentPage = (props) => {
  const {
    query: { slug }, // slug is an array of path segments
  } = useRouter()
  return (
    <>
      <h1>
        {hasMiddlewareMatched(slug)
          ? 'Middleware matched!'
          : 'Middleware ignored me'}
      </h1>
      <a href="/">{'<-'} back</a>
    </>
  )
}

export default ContentPage
