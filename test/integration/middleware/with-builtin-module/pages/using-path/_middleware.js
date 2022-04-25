import { NextResponse } from 'next/server'
import { basename } from 'path'

export async function middleware(request) {
  console.log(basename('/foo/bar/baz/asdf/quux.html'))
  return NextResponse.next()
}
