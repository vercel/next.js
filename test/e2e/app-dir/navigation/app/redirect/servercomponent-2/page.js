import { redirect } from 'next/navigation'

export default function Page() {
  redirect({
    url: '/redirect/result',
    permanent: true,
  })
  return <></>
}
