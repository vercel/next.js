import { useState, useEffect } from 'react'
import _ from 'lodash'
import dynamic from 'next/dynamic'

const One = dynamic(() => import('../components/one'))

const Page = () => {
  const [str, setStr] = useState('rad')
  useEffect(() => {
    setStr(_.pad(str, 7, '_'))
  }, [str])

  console.log(_)
  return (
    <div>
      page2
      <p id="padded-str">{str}</p>
      <One />
    </div>
  )
}

export default Page
