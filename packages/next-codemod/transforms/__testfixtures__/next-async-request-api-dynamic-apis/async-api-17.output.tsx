import { cookies } from 'next/headers'

export const myFun = async (): Promise<any> => {
  const name = (await cookies()).get('name')
}
