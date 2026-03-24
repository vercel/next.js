import { getTranslations } from 'next-intl/server'

export default async function HomePage() {
  const t = await getTranslations('HomePage')
  return (
    <div>
      <h1 id="intl-title">{t('title')}</h1>
    </div>
  )
}
