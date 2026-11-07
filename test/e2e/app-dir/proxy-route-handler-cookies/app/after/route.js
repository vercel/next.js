import { after, connection } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  await connection()
  after(async () => {
    const jar = await cookies()
    console.log(
      'cookies in after: ' +
        jar
          .getAll()
          .map((cookie) => cookie.name + '=' + cookie.value)
          .join(',')
    )
  })
  return Response.json({})
}
