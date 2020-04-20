import Page from '../components/Page'

export default function Index() {
  return <Page title="Index Page" linkTo="/other" />
}

export function getServerSideProps() {
  // config lastUpdate
  return { props: { initialState: JSON.stringify({ lastUpdate: new Date() }) } }
}
