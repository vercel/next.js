import { use } from 'react'
import Runtime from '../../utils/runtime'
import Time from '../../utils/time'

async function getData() {
  return {
    type: 'SSR',
  }
}

export const runtime = 'nodejs'

export default function Page(props) {
  const { type } = use(getData())
  return (
    <div className="node-rsc-ssr">
      This is a {type} RSC page.
      <br />
      <Runtime />
      <br />
      <Time />
    </div>
  )
}
