import { NextResponse } from 'next/server'
import { IExample } from './model'

export function GET() {
  // const data = await getExample()
  const data: IExample = {
    title: 'hello world!',
    description: 'This is an example route.',
  }

  return NextResponse.json(data)
}
