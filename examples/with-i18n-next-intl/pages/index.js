import { useTranslations } from 'next-intl'
import { useRouter } from 'next/router'
import Code from '../components/Code'
import PageLayout from '../components/PageLayout'

export default function Index() {
  const { locale } = useRouter()
  const t = useTranslations('Index')

  return (
    <PageLayout title={t('title')}>
      <p>
        {t('description', {
          locale,
          code: (children) => <Code>{children}</Code>,
        })}
      </p>
    </PageLayout>
  )
}
