import { useEffect, useState } from 'react'

export default function Page() {
  const [date, setDate] = useState<Number>()

  useEffect(() => {
    setDate(Date.now())
  }, [])

  // this variable is edited by the test to verify HMR
  const editedContent = ''
  return (
    <>
      <p>hello from host app</p>
      <div>{editedContent}</div>
      <div id="now">{`${date}`}</div>
    </>
  )
}
