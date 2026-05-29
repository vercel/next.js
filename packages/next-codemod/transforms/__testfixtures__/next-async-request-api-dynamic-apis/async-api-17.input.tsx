import { cookies } from 'next/headers'

export const myFun = async (): Promise<any> => {
  const name = cookies().get('name')
}
