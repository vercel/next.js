import Image from 'next/image'

const loader = undefined

export default () => (
  <div>
    <p>Should succeed during export</p>
    <Image alt="icon" src="/i.png" width="10" height="10" loader={loader} />
  </div>
)
