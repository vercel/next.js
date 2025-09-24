import { useEffect } from 'react'

export default function HomePage() {
  useEffect(() => {
    console.log('Pages Router: This is a log message from client component')
    console.error(
      'Pages Router: This is an error message from client component'
    )
    console.warn(
      'Pages Router: This is a warning message from client component'
    )
  }, [])

  return (
    <div>
      <h1>Pages Router Test Page</h1>
      <p>This page tests file logging with Pages Router</p>
    </div>
  )
}
