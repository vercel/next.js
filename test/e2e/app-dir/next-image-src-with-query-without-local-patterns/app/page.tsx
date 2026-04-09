import Image from 'next/image'

export default function Page() {
  // src with query without localPatterns will throw an error
  return <Image src="/test.png?v=1" alt="test" width={100} height={100} />
}
