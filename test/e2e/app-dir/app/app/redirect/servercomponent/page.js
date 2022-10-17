import { redirect } from 'next/dist/client/components/redirect'

export default function Page() {
  redirect('/redirect/result')
  return <></>
}
