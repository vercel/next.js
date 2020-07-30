import { withLng, useLng, getServerSideProps } from '@mies-co/next-lng'

// HomePage does not pass any props to Greet because it uses the React Context
const HomePage = () => {
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

// getServerSideProps is necessary for useLng and t to work properly
export { getServerSideProps }

// Uncomment if you need getInitialProps
// getInitialProps is also supported, it is automatically handled by next-lng
// HomePage.getInitialProps = async () => {
//   return {
//     something: true,
//   }
// }

// withLng provides the React Context so we can use useLng() lower in the hierarchy
export default withLng(HomePage)
