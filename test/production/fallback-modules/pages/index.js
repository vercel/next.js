import { useEffect, useState } from 'react'
import seedrandom from 'seedrandom'

const rng = seedrandom('hello')

export default function () {
  const [value, setValue] = useState(null)
  useEffect(() => {
    if (value) return
    setValue(rng())
  }, [value])
  return <div>{value == null ? 'loading' : value.toString()}</div>
}
