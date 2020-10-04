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
      <script src="https://polyfill.io/v3/polyfill.min.js?features=Blob%2CDocumentFragment%2CElement.prototype.append%2CElement.prototype.remove%2Cfetch"></script>
    </div>
  )
}

export default Page
