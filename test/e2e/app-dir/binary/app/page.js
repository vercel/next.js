import { Client } from './client'

export default function Page() {
  const binaryData = new Uint8Array([104, 101, 108, 108, 111])
  const nonUtf8BinaryData = new Uint8Array([0xff, 0, 1, 2, 3])

  return <Client binary={binaryData} arbitrary={nonUtf8BinaryData} />
}
