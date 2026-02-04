import { cookies } from 'next/headers'

export const GET = async function() {
  (await cookies()).get('token')
}

export async function POST(req: Request) {
  if (req.method === 'POST') {
    (await cookies()).get('token')
  }
}