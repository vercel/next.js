import Image from 'next/image'
export default function Page() {
  return (
    <Image
      src="/allowed/test.jpg"
      alt="allowed image"
      width={400}
      height={400}
    />
  )
}
