import UI from './ui'

import { getCookie, getHeader } from './actions'
import { validator } from './validator'

export default function Page() {
  return (
    <UI
      getCookie={getCookie}
      getHeader={getHeader}
      getAuthedUppercase={validator(async (str) => {
        'use server'
        return str.toUpperCase()
      })}
    />
  )
}
