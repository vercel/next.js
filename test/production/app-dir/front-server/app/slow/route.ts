import { connection } from 'next/server'

// Answers after `?ms=` milliseconds, so a test can signal the server while a
// request is in flight.
export async function GET(request: Request) {
  await connection()
  const ms = Number(new URL(request.url).searchParams.get('ms') ?? '2000')
  await new Promise((resolve) => setTimeout(resolve, ms))
  return new Response(`waited ${ms}`)
}
