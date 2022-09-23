import { useCookies } from 'next/dist/client/components/hooks-server'
import Router from './router'

export default function Page() {
  useCookies()

  return (
    <div id="old-router">
      <Router />
    </div>
  )
}
