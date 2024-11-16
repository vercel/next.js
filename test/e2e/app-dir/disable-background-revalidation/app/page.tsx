import React from 'react'

export default async function Page() {

  return (
    <>
      <h1>Simple ISR</h1>
      <p>
        Random: <em id="data">{Math.random()}</em>
      </p>
    </>
  )
}
