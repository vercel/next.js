import Button from '@/components/common/atoms/Button'
import Container from '@/components/common/atoms/Container'
import siteConfig from '@/config/site'
import { useTranslation } from 'next-i18next'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDiscord } from '@fortawesome/free-brands-svg-icons'

export default function DiscordRow() {
  const { t } = useTranslation()
  return (
    <>
      <Container className="py-48">
        <div className="mx-auto max-w-lg bg-discord shadow">
          <div className="px-4 py-5 sm:p-6">
            <FontAwesomeIcon
              icon={faDiscord}
              size="lg"
              aria-label="Discord icon"
              className="h-9 w-9 text-white"
            />
            <h3 className="mt-2 text-2xl font-semibold leading-6 text-white">
              {t('DiscordRow.title')}
            </h3>
            <div className="mt-2 sm:flex sm:items-start sm:justify-between">
              <div className="max-w-xl text-sm text-gray-50">
                <p>{t('DiscordRow.body')}</p>
              </div>
              <div className="mt-5 sm:ml-6 sm:mt-0 sm:flex sm:flex-shrink-0 sm:items-center">
                <Button
                  color="white"
                  href={siteConfig.discordInvitationLink}
                  target="_blank"
                  rel="noreferrer"
                  className=""
                >
                  {t('DiscordRow.button')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </>
  )
}
