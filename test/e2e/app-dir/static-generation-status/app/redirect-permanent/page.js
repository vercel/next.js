import { permanentRedirect, RedirectType } from 'next/navigation'

export default function Page() {
  permanentRedirect('/', RedirectType.push)
  return <></>
}
