import Image from 'next/image'

export default function Page() {
  return (
    <div className="page">
      <h1>Using legacy prop layout="responsive"</h1>
      <p>
        Even though we don't support "layout" in next/image, we can try to
        correct the style and print a warning.
      </p>
      <Image
        id="img"
        layout="responsive"
        src="/test.png"
        width="100"
        height="100"
        alt="my responsive image"
        priority
      />
    </div>
  )
}
