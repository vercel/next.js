import { useState } from 'react'
import { heavyValue } from '../lib/heavy'

export default function StaticAndDynamicPage() {
  const [value, setValue] = useState(heavyValue('static'))

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
