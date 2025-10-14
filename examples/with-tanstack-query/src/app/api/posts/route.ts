import { NextResponse } from 'next/server'

const posts = [
  { id: 1, title: 'First Post', content: 'This is the first post' },
  { id: 2, title: 'Second Post', content: 'This is the second post' },
  { id: 3, title: 'Third Post', content: 'This is the third post' },
]

export async function GET() {
  // Simulate delay
  await new Promise((resolve) => setTimeout(resolve, 1000))
  
  return NextResponse.json(posts)
}