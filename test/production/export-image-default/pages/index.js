import Image from 'next/image'

export default () => (
  <div>
    <p>Should error during export</p>
    <Image src="/i.png" width="10" height="10" />
  </div>
)
