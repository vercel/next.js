import Image from 'next/image'

export default function Page() {
  return (
    <>
      <Image
        id="relative-redirect"
        src="/redirect-relative"
        alt="relative redirect"
        width={128}
        height={128}
      />
      <Image
        id="absolute-redirect"
        src="/redirect-absolute"
        alt="absolute redirect"
        width={128}
        height={128}
      />
    </>
  )
}
