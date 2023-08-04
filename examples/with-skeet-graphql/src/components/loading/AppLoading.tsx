import Image from 'next/image'
import DotsBounce from '@/assets/animation/loading/3-dots-bounce.svg'
import DotsBounceWhite from '@/assets/animation/loading/3-dots-bounce-white.svg'

export default function AppLoading() {
  return (
    <>
      <div className="flex h-screen w-full -translate-y-12 items-center justify-center">
        <Image
          src={DotsBounce}
          alt="Loading..."
          className="h-6 w-auto dark:hidden sm:h-10"
          unoptimized
        />
        <Image
          src={DotsBounceWhite}
          alt="Loading..."
          className="hidden h-6 w-auto dark:block sm:h-10"
          unoptimized
        />
      </div>
    </>
  )
}
