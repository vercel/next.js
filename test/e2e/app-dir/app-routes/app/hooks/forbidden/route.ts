import { forbidden } from 'next/navigation'

export async function GET() {
  forbidden()
}
