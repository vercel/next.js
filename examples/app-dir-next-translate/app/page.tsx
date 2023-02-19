import useTranslation from 'next-translate/useTranslation'
import Counter from './components/counter'
import LocaleSwitcher from './components/locale-switcher'

export default async function IndexPage() {
  const { lang, t } = useTranslation('common')

  return (
    <div>
      <LocaleSwitcher />
      <p>Current locale: {lang}</p>
      <p>
        This text is rendered on the server:{' '}
        {t('server-component.welcome')}
      </p>
      <Counter />
    </div>
  )
}
