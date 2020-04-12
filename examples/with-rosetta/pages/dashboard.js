import useI18n from '../hooks/use-i18n'

const Dashboard = ({ lng }) => {
  const i18n = useI18n(lng)

  return (
    <div>
      <h1>{i18n.t('intro.welcome', 'Peter')}</h1>
      <h3>Client side only.</h3>
      <a
        style={{
          lineHeight: 1.5,
          textAlign: 'center',
          boxSizing: 'border-box',
          backgroundColor: 'green',
          textDecoration: 'inherit',
          padding: '10px',
          border: '0 solid #e2e8f0',
          color: 'white',
          borderRadius: '.25rem',
          borderWidth: '1px',
        }}
        onClick={() => i18n.locale('de')}
      >
        Change language client-side
      </a>
    </div>
  )
}

export default Dashboard
