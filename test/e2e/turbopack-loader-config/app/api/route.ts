import { NextResponse } from 'next/server'
import foo from '../../foo.js'
// @ts-expect-error -- ignore
import bar from '../../bar.js?test=hi'

export async function GET(_req) {
  return NextResponse.json(
    {
      foo,
      bar,
    },
    { status: 200 }
  )
}
