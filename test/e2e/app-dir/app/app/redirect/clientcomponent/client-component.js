'client'
import { redirect } from 'next/dist/client/components/redirect'

export default function ClientComp() {
  redirect('/redirect/result')
  return <></>
}
