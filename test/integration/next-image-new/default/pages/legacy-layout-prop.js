import Image from 'next/image'

export default function Page() {
  return (
    <div className="page">
      <h1>Using legacy prop "layout"</h1>
      <p>
        Even though we don't support "layout" in next/image, we can forward to
        next/legacy/image
      </p>
      <Image
        id="img"
        layout="responsive"
        src="/test.png"
        width="100"
        height="100"
        alt=""
        priority
      />
    </div>
  )
}
