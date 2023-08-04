import Container from '@/components/common/atoms/Container'
import { useTranslation } from 'next-i18next'
import Image from 'next/image'
import nextjsLogo from '@/assets/img/logo/projects/nextjs.svg'
import i18nextLogo from '@/assets/img/logo/projects/i18next.webp'
import recoilLogo from '@/assets/img/logo/projects/recoil.svg'
import graphqlLogo from '@/assets/img/logo/projects/graphql.svg'
import relayLogo from '@/assets/img/logo/projects/relay.svg'
import firebaseLogo from '@/assets/img/logo/projects/Firebase.svg'
import tailwindcssLogo from '@/assets/img/logo/projects/tailwindcss.svg'
import typescriptLogo from '@/assets/img/logo/projects/TypeScriptHorizontal.svg'
import Button from '@/components/common/atoms/Button'
import clsx from 'clsx'

export default function HomeHeroRow() {
  const { t } = useTranslation()

  return (
    <>
      <Container className="pb-40 pt-24 text-center lg:pb-64 lg:pt-40">
        <h1 className="font-display mx-auto max-w-4xl text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-7xl">
          WebApp Boilerplate
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg tracking-tight text-gray-700 dark:text-gray-200">
          {t('home:HeroRow.body')}
        </p>
        <div className="mt-10 flex justify-center gap-x-6">
          <Button href="/auth/login" className="">
            {t('aiChat')}
          </Button>
          <Button
            href="https://github.com/elsoul/skeet-cli"
            variant="outline"
            className=""
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </Button>
        </div>
        <div className="mt-36 lg:mt-48">
          <ul
            role="list"
            className="mt-8 flex flex-col items-center justify-center gap-x-8 gap-y-10 sm:gap-x-0 xl:flex-row xl:gap-x-12 xl:gap-y-0"
          >
            {[
              [
                {
                  name: 'Next.js',
                  logo: nextjsLogo,
                  link: 'https://nextjs.org/',
                },
                {
                  name: 'Firebase',
                  logo: firebaseLogo,
                  link: 'https://firebase.google.com/',
                },
                {
                  name: 'TypeScript',
                  logo: typescriptLogo,
                  link: 'https://www.typescriptlang.org/',
                },
                {
                  name: 'Tailwind',
                  logo: tailwindcssLogo,
                  link: 'https://tailwindcss.com/',
                },
              ],
              [
                {
                  name: 'GraphQL',
                  logo: graphqlLogo,
                  link: 'https://graphql.org/',
                },
                {
                  name: 'Relay',
                  logo: relayLogo,
                  link: 'https://relay.dev/',
                },
                {
                  name: 'Recoil',
                  logo: recoilLogo,
                  link: 'https://recoiljs.org/',
                },
                {
                  name: 'i18next',
                  logo: i18nextLogo,
                  link: 'https://www.i18next.com/',
                },
              ],
            ].map((group, groupIndex) => (
              <li key={`HeroRowLogoCloudList${groupIndex}`}>
                <ul
                  role="list"
                  className="flex flex-row items-center gap-x-6 sm:gap-x-12"
                >
                  {group.map((project) => (
                    <li key={project.name} className="flex">
                      <a href={project.link} target="_blank" rel="noreferrer">
                        <Image
                          src={project.logo}
                          alt={project.name}
                          className={clsx(
                            'hover:opacity-60 dark:grayscale',
                            project.name === 'React'
                              ? 'dark:invert-0'
                              : 'dark:invert'
                          )}
                          width={168}
                          height={48}
                          unoptimized
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </>
  )
}
