import { test } from 'vitest'
import { condition } from 'next-testing-condition-probe'
import 'next/dist/compiled/server-only'

test('RSC retains React server conditions', () => {
  if (condition !== 'react-server')
    throw new Error(`Wrong condition: ${condition}`)
})
