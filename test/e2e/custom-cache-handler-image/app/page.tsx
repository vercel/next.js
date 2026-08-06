import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>hello world</p>
      {/* Each unique width/quality combination creates a separate cache entry */}
      <Image
        id="image-small"
        src="/test.png"
        width={100}
        height={100}
        quality={75}
        alt="small image"
      />
      <Image
        id="image-medium"
        src="/test.png"
        width={200}
        height={200}
        quality={75}
        alt="medium image"
      />
      <Image
        id="image-large"
        src="/test.png"
        width={400}
        height={400}
        quality={75}
        alt="large image"
      />
    </div>
  )
}
