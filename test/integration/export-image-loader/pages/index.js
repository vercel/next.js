import Image from 'next/image'

const Index = () => (
  <div>
    <p>Should succeed during export</p>
    <Image alt="icon" src="/i.png" width="10" height="10" />
  </div>
)

export default Index
