import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>Should not error during export</p>
      <Image src="/i.png" width="10" height="10" alt="" unoptimized />
    </div>
  )
}
