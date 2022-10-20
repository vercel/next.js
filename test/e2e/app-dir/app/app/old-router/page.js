import { cookies } from 'next/headers'
import Router from './router'

export default function Page() {
  cookies()

  return (
    <div id="old-router">
      <Router />
    </div>
  )
}
