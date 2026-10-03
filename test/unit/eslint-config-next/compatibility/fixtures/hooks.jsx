import { useEffect, useState } from 'react'

export default function Page({ enabled, value }) {
  if (enabled) useState(0)
  useEffect(() => {
    console.log(value)
  }, [])
  return <div />
}
