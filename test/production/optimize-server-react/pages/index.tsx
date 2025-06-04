import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    console.log('use-effect-call-log')
  }, [])
  return <p>hello world</p>
}

// Mark as dynamic
export function getServerSideProps() {
  return { props: {} }
}
