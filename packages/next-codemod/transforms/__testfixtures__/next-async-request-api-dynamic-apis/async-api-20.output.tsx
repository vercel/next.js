import { cookies } from 'cookies'

export function MyCls() {
  return async function Page() {
    return (await cookies()).get('token')
  }
}
