import Image from 'next/image'

const Page = () => {
  return (
    <main>
      <Image
        id="nested-blocked"
        src="/blocked/test.png"
        width="200"
        height="200"
        alt="should fail"
      />
    </main>
  )
}

export default Page
