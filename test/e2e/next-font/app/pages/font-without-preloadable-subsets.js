import { Noto_Sans_Math } from 'next/font/google'

const notoSansMath = Noto_Sans_Math({ weight: '400' })

export default function FontWithoutPreloadableSubsets() {
  return (
    <p className={notoSansMath.className}>{JSON.stringify(notoSansMath)}</p>
  )
}
