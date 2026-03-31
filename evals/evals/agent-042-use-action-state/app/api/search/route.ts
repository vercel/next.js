import { NextRequest, NextResponse } from 'next/server'

const products = [
  { id: 1, name: 'Wireless Headphones', category: 'electronics' },
  { id: 2, name: 'Running Shoes', category: 'sports' },
  { id: 3, name: 'Coffee Maker', category: 'kitchen' },
  { id: 4, name: 'Yoga Mat', category: 'sports' },
  { id: 5, name: 'Laptop Stand', category: 'electronics' },
  { id: 6, name: 'Water Bottle', category: 'sports' },
  { id: 7, name: 'Desk Lamp', category: 'electronics' },
  { id: 8, name: 'Backpack', category: 'accessories' },
]

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? ''

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  const results = products.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  )

  return NextResponse.json(results)
}
