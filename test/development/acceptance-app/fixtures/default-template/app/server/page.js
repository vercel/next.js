import Component from '../../index'
import { cookies } from 'next/server'

export default function Page() {
  cookies()
  return <Component />
}

export const dynamic = 'error'
