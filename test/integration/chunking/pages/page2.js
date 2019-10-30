import { useState, useEffect } from 'react'
import _ from 'lodash'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const One = dynamic(() => import('../components/one'))

const Page = () => {
  const [str, setStr] = useState('rad')
  useEffect(() => {
    setStr(_.pad(str, 7, '_'))
  }, [])

  console.log(_)
  return (
    <div>
      page2
      <p id='padded-str'>{str}</p>
      <One />
      <Link href='/page3'>Page3</Link>
    </div>
  )
}

export default Page
