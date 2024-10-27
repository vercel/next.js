import Image from 'next/image'

export default function Home() {
  return (
    <main>
      <div>Hello world!</div>
      <Image src="/test.jpg" priority alt="" width={500} height={500} />
    </main>
  )
}
