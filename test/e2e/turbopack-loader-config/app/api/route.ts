import { NextResponse } from 'next/server'
import foo from '../../foo.js'
import bar from '../../bar.js'

export async function GET(_req) {
  return NextResponse.json(
    {
      foo,
      bar,
    },
    { status: 200 }
  )
}
