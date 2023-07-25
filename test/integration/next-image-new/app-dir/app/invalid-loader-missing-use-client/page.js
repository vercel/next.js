import Image from 'next/image'

export function myLoader({ src, width, quality = 50 }) {
  return `https://example.vercel.sh${src}?width=${width * 2}&quality=${quality}`
}

const Page = () => {
  return (
    <div>
      <h1>Pretty error when loader func is missing "use client"</h1>
      <Image
        id="my-img"
        src="/test.png"
        width={100}
        height={100}
        loader={myLoader}
      />
    </div>
  )
}

export default Page
