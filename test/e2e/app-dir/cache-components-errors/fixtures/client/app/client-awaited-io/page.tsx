import { setTimeout } from 'timers/promises'
import { Client } from './client'

export default async function Page() {
  return <Client io={setTimeout(100, 'Hello, Dave!')} />
}
