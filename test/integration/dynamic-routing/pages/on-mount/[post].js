import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { query } = router
  return (
    <>
      <p>onmpost: {query.post || 'pending'}</p>
      {Array.from({ length: 500 }, (x, i) => i + 1).map(i => {
        return (
          <div key={`item-${i}`} id={`item-${i}`}>
            {i}
          </div>
        )
      })}
    </>
  )
}
