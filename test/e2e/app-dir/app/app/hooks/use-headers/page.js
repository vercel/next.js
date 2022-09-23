import { useHeaders } from 'next/dist/client/components/hooks-server'

export default function Page() {
  const headers = useHeaders()
  const hasHeader = headers.get('x-use-headers') === 'value'
  const referer = headers.get('referer')

  return (
    <>
      <h1 id="text">hello from /hooks/use-headers</h1>
      {hasHeader ? (
        <h2 id="has-header">Has x-use-headers header</h2>
      ) : (
        <h2 id="does-not-have-header">Does not have x-use-headers header</h2>
      )}
      {referer && <h3 id="has-referer">Has referer header</h3>}
    </>
  )
}
