import { cookies } from 'next/headers'

export async function MyComponent() {
  const name = cookies().get('name')
  callback(name)
}

function callback(name: any) {
  console.log(name)
}
