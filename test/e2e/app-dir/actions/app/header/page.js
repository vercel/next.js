import UI from './ui'

import { getCookie, getHeader } from './actions'

export default function Page() {
  return <UI getCookie={getCookie} getHeader={getHeader} />
}
