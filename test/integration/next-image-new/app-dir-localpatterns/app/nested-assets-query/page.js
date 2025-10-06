import Image from 'next/image'

const Page = () => {
  return (
    <main>
      <Image
        id="nested-assets-query"
        src="/assets/test.png?v=1"
        width="200"
        height="200"
        alt="should fail"
      />
    </main>
  )
}

export default Page
