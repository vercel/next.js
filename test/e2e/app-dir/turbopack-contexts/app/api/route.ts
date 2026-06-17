import { NextResponse } from 'next/server'

// Imported in the default context (no loader, default export condition).
import normalValue from '../../value.special.js'
// @ts-expect-error -- cond-pkg has no types
import normalCond from 'cond-pkg'

import { contextCond, contextValue } from '../special-entry'

export async function GET() {
  return NextResponse.json({
    normalValue,
    contextValue,
    normalCond,
    contextCond,
  })
}
