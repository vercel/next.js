import React from 'react'
import { useOvermind } from '../overmind'

function Items () {
  const { state } = useOvermind()

  return (
    <ul>
      {state.items.map((item) =>
        <li key={item.id}>{item.title}</li>
      )}
    </ul>
  )
}

export default Items
