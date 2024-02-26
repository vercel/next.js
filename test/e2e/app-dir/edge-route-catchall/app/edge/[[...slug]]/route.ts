import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

type Context = {
  params: {
    slug: string[]
  }
}

export const GET = async (req: NextRequest, { params }: Context) => {
  return NextResponse.json(params)
}
