import React from 'react'
import ReactDOM from 'react-dom'
import { useCachedPromise } from './promise-cache'

export default function Hello({ name, thrown = false }) {
  useCachedPromise(
    name,
    () => new Promise((resolve) => setTimeout(resolve, 200)),
    thrown
  )

  return <p>hello {ReactDOM.version}</p>
}
