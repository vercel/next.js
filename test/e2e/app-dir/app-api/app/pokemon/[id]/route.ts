import { NextResponse } from 'next/server'
import { requestHandler } from '../../request-handler'

export const GET = requestHandler(async (_, context) => {
  const res = await fetch(`https://api.vercel.app/pokemon/${context.params.id}`)
  const pokemon = await res.json()

  return NextResponse.json(pokemon)
})
