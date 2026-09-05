import { useState } from 'react'
import { sharedValue } from '../lib/shared'

export default function DynamicOnlyPage() {
  const [value, setValue] = useState(sharedValue('not loaded'))

  return (
    <button
      onClick={() => {
        import('../lib/heavy').then(async ({ nestedHeavyValue }) => {
          setValue(await nestedHeavyValue('dynamic'))
        })
      }}
    >
      {value}
    </button>
  )
}
