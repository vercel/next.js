import useI18n from '../hooks/use-i18n'

const Dashboard = () => {
  const i18n = useI18n()

  return (
    <div>
      <h1>{i18n.t('intro.welcome', { username: 'Peter' })}</h1>
      <h3>Client side only.</h3>
      <div>Current locale: {i18n.activeLocale}</div>
      <a href="#" onClick={() => i18n.locale('de')}>
        Change language client-side to 'de'
      </a>
    </div>
  )
}

export default Dashboard
