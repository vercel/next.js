import { useTranslation } from 'next-i18next'
import Link from '@/components/routing/Link'
import Container from '@/components/common/atoms/Container'
import LogoHorizontalLink from '@/components/common/atoms/LogoHorizontalLink'
import siteConfig from '@/config/site'
import { commonFooterNav } from '@/config/navs'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faDiscord,
  faInstagram,
  faGithub,
  faTwitter,
} from '@fortawesome/free-brands-svg-icons'

export default function CommonFooter() {
  const { t } = useTranslation()

  return (
    <>
      <footer className="p-4">
        <div className="bg-gray-50 dark:bg-gray-800">
          <Container>
            <div className="py-16">
              <LogoHorizontalLink className="mx-auto h-10 w-auto" />
              <nav className="mt-10 text-sm" aria-label="quick links">
                <div className="flex flex-col justify-center gap-6 text-center sm:-my-1 sm:flex-row">
                  {commonFooterNav.map((nav) => (
                    <Link
                      key={`${nav.name} CommonFooter.commonFooterNav`}
                      href={nav.href ?? ''}
                      className="text-base font-medium text-gray-700 hover:text-gray-900 dark:text-gray-50 dark:hover:text-gray-200 sm:py-0"
                    >
                      {t(nav.name)}
                    </Link>
                  ))}
                </div>
              </nav>
            </div>
            <div className="flex flex-col items-center border-t border-gray-400/10 py-10 sm:flex-row-reverse sm:justify-between">
              <div className="flex gap-x-6">
                <a
                  href={`https://twitter.com/${siteConfig.twitterAccount}`}
                  className="group text-gray-500 hover:text-gray-700"
                  aria-label="Twitter"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FontAwesomeIcon
                    icon={faTwitter}
                    size="sm"
                    aria-label="Twitter icon"
                    className="h-6 w-6"
                  />
                </a>
                <a
                  href={`https://github.com/${siteConfig.githubAccount}`}
                  className="group text-gray-500 hover:text-gray-700"
                  aria-label="GitHub"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FontAwesomeIcon
                    icon={faGithub}
                    size="sm"
                    aria-label="GitHub icon"
                    className="h-6 w-6"
                  />
                </a>
                <a
                  href={`${siteConfig.discordInvitationLink}`}
                  className="group text-gray-500 hover:text-gray-700"
                  aria-label="Discord Server Invitation"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FontAwesomeIcon
                    icon={faDiscord}
                    size="sm"
                    aria-label="Discord icon"
                    className="h-6 w-6"
                  />
                </a>
                <a
                  href={`https://instagram.com/${siteConfig.instagramAccount}`}
                  className="group text-gray-500 hover:text-gray-700"
                  aria-label="Instagram"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FontAwesomeIcon
                    icon={faInstagram}
                    size="sm"
                    aria-label="Instagram icon"
                    className="h-6 w-6"
                  />
                </a>
              </div>
              <p className="mt-6 text-sm text-gray-500 sm:mt-0">
                &copy; {new Date().getFullYear()} {siteConfig.copyright} All
                rights reserved.
              </p>
            </div>
          </Container>
        </div>
      </footer>
    </>
  )
}
