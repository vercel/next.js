import type { NextRequest } from 'next/server'

export const revalidate = -1
export async function generateStaticParams(s: string) {
  return false
}

export function bar() {}

export function GET(request: boolean) {}

export function POST(request: NextRequest) {}

export function PUT(request: Request, { foo }) {}

export function DELETE(request: Request) {}
