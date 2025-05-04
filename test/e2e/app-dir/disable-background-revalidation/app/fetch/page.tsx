import React from 'react'

export default async function Page() {
  const response = await fetch(
    `http://localhost:${process.env.TEST_SERVER_PORT}/api/time`,
    {
      // @ts-ignore
      next: { revalidate: false },
    }
  )
  const body = await response.json()

  return (
    <>
      <h1>Simple ISR with fetch</h1>
      <p>
        Time: <em id="data">{body.time}</em>
        Random: <em id="rand">{Math.random()}</em>
      </p>
    </>
  )
}
