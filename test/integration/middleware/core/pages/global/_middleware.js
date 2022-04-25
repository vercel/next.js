import { NextResponse } from 'next/server'

export async function middleware(request, ev) {
  console.log(process.env.MIDDLEWARE_TEST)

  return NextResponse.json({
    process: {
      env: process.env,
    },
  })
}
