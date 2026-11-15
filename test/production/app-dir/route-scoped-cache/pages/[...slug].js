import { state, State } from '../lib/state'
export default function Page(props) {
  return <State value={props} />
}
export function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
export function getStaticProps({ params, locale }) {
  return { props: state('pages-catchall', params, locale), revalidate: 3600 }
}
