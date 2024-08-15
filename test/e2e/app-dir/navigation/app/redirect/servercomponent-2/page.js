import { permanentRedirect, RedirectType } from 'next/navigation'

export default function Page() {
  permanentRedirect('/redirect/result', RedirectType.push)
  return <></>
}
