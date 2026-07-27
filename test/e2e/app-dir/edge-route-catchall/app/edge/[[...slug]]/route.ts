import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

type Context = {
  params: Promise<{
    slug: string[]
  }>
}

export const GET = async (req: NextRequest, { params }: Context) => {
  return NextResponse.json(await params)
}
