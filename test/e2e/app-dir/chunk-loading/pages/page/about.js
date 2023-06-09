import { useReducer } from 'react'
import { Links } from '../../components/links'

import { DynamicShared } from '../../components/DynamicShared'

export default function About() {
  let [shouldload, load] = useReducer(() => true, false)
  return (
    <>
      <div>About</div>
      {shouldload ? (
        <DynamicShared />
      ) : (
        <button onClick={load}>Load module</button>
      )}
      <Links />
    </>
  )
}
