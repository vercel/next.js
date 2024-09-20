import { NextRequest } from 'next/server'

export default async function intercept(request: NextRequest): Promise<void> {
  console.log('Error: interceptor called!')
}
