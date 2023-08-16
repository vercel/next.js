import Image from 'next/image'

export default function Page() {
  return (
    <div className="page">
      <h1>Using legacy prop layout="fill"</h1>
      <p>
        Even though we don't support "layout" in next/image, we can try to
        correct the style and print a warning.
      </p>
      <div style={{ position: 'relative', width: '200px', height: '400px' }}>
        <Image
          id="img"
          layout="fill"
          src="/test.jpg"
          alt="my fill image"
          quality={50}
          objectFit="cover"
          objectPosition="10% 10%"
          sizes="200px"
          priority
        />
      </div>
    </div>
  )
}
