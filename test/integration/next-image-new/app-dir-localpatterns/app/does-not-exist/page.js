import Image from 'next/image'

const Page = () => {
  return (
    <main>
      <Image
        id="does-not-exist"
        src="/does-not-exist.png"
        width="200"
        height="200"
        alt="should fail"
      />
    </main>
  )
}

export default Page
