import Image from 'next/image'

export default function Page() {
  return (
    <p>
      <Image id="logo" alt="logo" src="/logo.png" width="400" height="400" />
    </p>
  )
}
