import { NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import fs from 'fs'
import path from 'path'

export const config = {
  runtime: 'nodejs',
}

export async function middleware(req) {
  console.log('middleware', req.url)
  console.log(
    'env',
    await fs.promises.readFile(path.join(process.cwd(), '.env'))
  )

  if (req.nextUrl.pathname === '/a-non-existent-page/to-test-with-middleware') {
    return new ImageResponse(<div>Hello world</div>, {
      width: 1200,
      height: 600,
    })
  }
  return NextResponse.next()
}
