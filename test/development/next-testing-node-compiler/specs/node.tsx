import { test } from 'vitest'
import { condition } from 'next-testing-condition-probe'
import { value } from '@/lib/value'
import { alias } from 'test-project-alias'
import { useState } from 'react'
import 'next/dist/compiled/client-only'

test('Node conditions, configuration aliases, TypeScript and JSX', () => {
  const element = <span>{value}</span>
  if (condition !== 'node-development')
    throw new Error(`Wrong condition: ${condition}`)
  if (alias !== 'resolved-alias' || element.props.children !== 42)
    throw new Error('Lost project transforms')
  if (typeof useState !== 'function')
    throw new Error('Unexpected React server condition')
})
