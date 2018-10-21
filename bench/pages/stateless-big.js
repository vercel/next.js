import React from 'react'

export default () => {
  return <ul>{items()}</ul>
}

const items = () => {
  var out = new Array(10000)
  for (let i = 0; i < out.length; i++) {
    out[i] = <li key={i}>This is row {i + 1}</li>
  }
  return out
}
