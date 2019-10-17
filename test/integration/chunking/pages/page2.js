import * as _ from 'lodash'
import dynamic from 'next/dynamic'

const One = dynamic(() => import('../components/one'))

const Page = () => {
  console.log(_)
  return (
    <div id='page-2'>
      page2
      <One />
    </div>
  )
}

export default Page
