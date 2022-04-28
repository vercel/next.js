import { NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function middleware(request) {
  console.log(spawn('ls', ['-lh', '/usr']))
  return NextResponse.next()
}
