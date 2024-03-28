import { NextResponse } from 'next/server'
import fs from 'fs'

const data = fs.readFileSync('file-does-not-exist.txt', 'utf8')

export function GET() {
  return new NextResponse(data, {
    status: 200,
  })
}
