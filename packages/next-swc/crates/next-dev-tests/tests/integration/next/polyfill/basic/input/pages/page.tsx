import { useEffect, useState } from 'react'

export default function Page() {
  const [state, setState] = useState('SSR')
  useEffect(() => {
    setState(
      <div id="client">
        {Buffer.from('Hello Client Page', 'utf-8').toString()}
      </div>
    )
  }, [setState])
  return (
    <div>
      <div id="server">
        {Buffer.from('Hello Server Page', 'utf-8').toString()}
      </div>
      {state}
    </div>
  )
}
