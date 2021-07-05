import Image from 'next/image'

const Index = () => (
  <div>
    <p>Should error during export</p>
    <Image src="/i.png" width="10" height="10" />
  </div>
)

export default Index
