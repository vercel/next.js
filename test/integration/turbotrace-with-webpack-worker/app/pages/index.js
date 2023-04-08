import { fetchData } from '../lib/fetch-data'

export default function Page() {
  return 'index page'
}

export function getStaticProps() {
  fetchData()

  return {
    props: {},
  }
}
