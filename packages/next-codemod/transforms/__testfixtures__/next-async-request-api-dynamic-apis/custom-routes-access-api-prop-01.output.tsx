import { headers } from 'next/headers'

export const GET = async function() {
  await headers()
}

export async function POST() {
  await headers()
}

export async function DELETE() {
  await headers()
}
