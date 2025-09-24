import { headers } from 'next/headers'

function Component() {
  ;(headers() as any).get('component')
  ;(headers() as any).has('component')

  const allHeaders = [...(headers() as any)]
  return <pre>{JSON.stringify(allHeaders, null, 2)}</pre>
}

export default function Page() {
  ;(headers() as any).get('page')
  return (
    <>
      <Component />
      <Component />
    </>
  )
}
