import {
  getCookie,
  getHeader,
  setCookie,
  setCookieAndRedirect,
} from '../actions'
import UI from '../ui'
import { validator } from './validator'

export default function Page() {
  const prefix = 'Prefix:'
  return (
    <UI
      getCookie={getCookie}
      getHeader={getHeader}
      setCookie={setCookie}
      setCookieAndRedirect={setCookieAndRedirect}
      getAuthedUppercase={validator(async (str) => {
        'use server'
        return prefix + ' ' + str.toUpperCase()
      })}
    />
  )
}

export const runtime = 'edge'
