import Image from 'next/image'

export default function Home() {
  // Only the jpg is approved in the NextConfig's image.remotePatterns.
  return (
    <Image
      id="external"
      alt="test src image"
      src="https://image-optimization-test.vercel.app/test.webp"
      width="100"
      height="100"
    />
  )
}
