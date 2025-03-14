import { connection } from 'next/server'

export default function Layout({ bar, foo, children }) {
  return (
    <div>
      <h1>Parallel Routes Layout - No Children</h1>
      <div id="foo-slot">{foo}</div>
      <div id="bar-slot">{bar}</div>
      {children}
    </div>
  )
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 300))
  return {
    title: 'parallel-routes-no-children layout title',
    description: 'parallel-routes-no-children layout description',
  }
}
