import { useState } from 'react'

export function Widget({ open }) {
  if (open) {
    useState(0)
  }
  return <Missing />
}

export default () => <Widget />
