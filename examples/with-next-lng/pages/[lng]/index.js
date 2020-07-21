import { withLng, useLng, getServerSideProps } from '@mies-co/next-lng'

// Move Greet to a dedicated directory like comps/ or components/
const Greet = () => {
  const { lng, setLng, t } = useLng()
  return (
    <>
      <p>{t('greet')}</p>
      <p>{t('whoami', { firstname: 'Bob' })}</p>
      <button onClick={() => setLng('en')}>EN</button>
      <button onClick={() => setLng('fr')}>FR</button>
      <p>Current language is {lng}</p>
    </>
  )
}

// HomePage does not pass any props to Greet because it uses the React Context
const HomePage = () => {
  return <Greet />
}

// getServerSideProps gets the translations
// of our /public/static/translations directory and adds them to the React Context
export { getServerSideProps }

// withLng provides the React Context so we can use useLng() lower in the hierarchy
export default withLng(HomePage)
