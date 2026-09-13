import Image from 'next/image'
import { readViewer } from '../lib/viewer'

export default function Page() {
  const viewer = readViewer()
  return (
    <>
      <p>{`Viewer: ${viewer}`}</p>
      <Image src="/pixel.png" alt="Preview" width={64} height={64} quality={60} />
    </>
  )
}
