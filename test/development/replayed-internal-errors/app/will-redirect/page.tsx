import { redirect } from 'next/navigation'

export default function Page() {
  console.error(new Error('This error should get replayed'))
  redirect('/redirect-target') // ...and this one shouldn't
}
