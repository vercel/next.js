import { logWithTime, setTimeout } from '../time-utils'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'
import { getData } from './data'

export default async function interceptNested(
  request: NextRequest
): Promise<void> {
  await logWithTime('NestedInterceptor', () => setTimeout(500))

  if (request.nextUrl.searchParams.has('seed-react-cache')) {
    // seed some data cache for the current request
    getData().then((data) => console.log({ data }))
  }

  if (request.nextUrl.searchParams.has('redirect')) {
    redirect('/')
  }

  if (request.nextUrl.searchParams.has('error')) {
    throw new Error('Kaputt!')
  }
}
