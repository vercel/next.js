import Image from 'next/image'
import Named from 'next/image'

export default function Home() {
  return (<div>
    <h1>Both</h1>
    <Image src="/test.jpg" width="200" height="300" />
    <Named src="/test.png" width="500" height="400" />
  </div>)
}