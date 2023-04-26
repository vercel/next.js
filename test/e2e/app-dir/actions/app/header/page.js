import UI from './ui'

import { getCookie, getHeader, setCookie } from './actions'
import { validator } from './validator'

export default function Page() {
  const prefix = 'Prefix:'
  return (
    <UI
      getCookie={getCookie}
      getHeader={getHeader}
      setCookie={setCookie}
      getAuthedUppercase={validator(async (str) => {
        'use server'
        return prefix + ' ' + str.toUpperCase()
      })}
    />
  )
}
