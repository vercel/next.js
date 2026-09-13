import Image from 'next/image'

export default function Page() {
  return (
    <Image
      id="image"
      src="/transparent.png"
      alt="No placeholder"
      width={160}
      height={394}
    />
  )
}
