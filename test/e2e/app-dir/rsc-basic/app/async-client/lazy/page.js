import { lazy } from 'react'

const Client = lazy(() => import('../client'))

export default function Page() {
  return <Client />
}
