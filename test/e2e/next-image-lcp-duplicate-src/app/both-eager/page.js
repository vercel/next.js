import Image from 'next/image'
import { LcpReporter } from '../lcp-reporter'

export default function Page() {
  return (
    <div>
      <LcpReporter />
      <Image
        id="eager"
        src="/slow-image"
        loading="eager"
        width={1200}
        height={700}
        unoptimized
        alt="hero eager"
      />
      <div style={{ height: '200vh' }} />
      <Image
        id="second-eager"
        src="/slow-image"
        loading="eager"
        width={1200}
        height={700}
        unoptimized
        alt="duplicate eager"
      />
    </div>
  )
}
