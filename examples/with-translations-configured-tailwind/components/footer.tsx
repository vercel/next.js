import useTranslation from 'next-translate/useTranslation'
import { MODERN_WEBSITES_REPOSITORY_URL } from '../lib/constants'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer>
      <span>
        © 2022{' '}
        <a target="__blank" rel="external" href={MODERN_WEBSITES_REPOSITORY_URL}>
          {t('common:modern_websites')}
        </a>. {t('common:rights')}.
      </span>
    </footer>
  )
}
