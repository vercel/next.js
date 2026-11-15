'use client'

export default function HomeError({ error }: { error: Error }) {
  return <div id="home-error">Home Error: {error.message}</div>
}
