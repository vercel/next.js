import { useTranslations } from 'next-intl'
import { useRouter } from 'next/router'
import Code from '../components/Code'
import PageLayout from '../components/PageLayout'

export default function Test() {
  const { locale } = useRouter()
  const t = useTranslations('Test')

  return (
    <PageLayout title={t('title')}>
      <p>
        {t('description', {
          locale,
          code: (children) => <Code>{children}</Code>,
        })}
      </p>
      <p>
        {t('lastUpdated', {
          lastUpdated: new Date('2021-01-22T15:58:45.567Z'),
        })}
      </p>
    </PageLayout>
  )
}

export function getStaticProps({ locale }) {
  return {
    props: {
      messages: locale ? require(`../messages/test/${locale}.json`) : undefined,
    },
  }
}
