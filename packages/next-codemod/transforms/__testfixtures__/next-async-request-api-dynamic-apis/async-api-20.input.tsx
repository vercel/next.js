import { cookies, draftMode } from 'cookies'

export async function myFun() {
  const isDraft = (await draftMode()).isEnabled
  return async function () {
    return (await cookies()).get('token')
  }
}
