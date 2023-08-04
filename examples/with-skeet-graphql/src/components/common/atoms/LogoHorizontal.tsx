import Image from 'next/image'
import logoHorizontal from '@/assets/img/logo/SkeetLogoHorizontal.svg'
import logoHorizontalInvert from '@/assets/img/logo/SkeetLogoHorizontalInvert.svg'
import clsx from 'clsx'

type Props = {
  className?: string
  onClick?: () => void
}

export default function LogoHorizontal({ className, ...rest }: Props) {
  return (
    <>
      <div {...rest}>
        <span className="sr-only">Skeet</span>
        <Image
          src={logoHorizontal}
          alt="Skeet Framework"
          className={clsx('dark:hidden ', className)}
          unoptimized
        />
        <Image
          src={logoHorizontalInvert}
          alt="Skeet Framework"
          className={clsx('hidden dark:block', className)}
          unoptimized
        />
      </div>
    </>
  )
}
