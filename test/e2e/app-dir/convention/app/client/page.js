// bar/page.js should work with client hook
'client'

import { useState } from 'react'

export default function Page() {
  const [text] = useState('bar:client-entry + client:useState')
  return <div>{text}</div>
}
