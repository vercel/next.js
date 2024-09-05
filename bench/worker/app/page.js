import React from 'react'
import Client from './client'

export default function Page() {
  return (
    <>
      <h1>My Page</h1>
      <button
      // onClick={() => {
      //   console.log(new Worker(new URL('./worker.js', import.meta.url)))
      // }}
      >
        abc
      </button>
      <Client />
    </>
  )
}
