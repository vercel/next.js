import { cookies } from 'next/dist/client/components/hooks-server'
import Router from './router'

export default function Page() {
  cookies()

  return (
    <div id="old-router">
      <Router />
    </div>
  )
}
