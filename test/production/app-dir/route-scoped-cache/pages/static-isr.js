import { state, State } from '../lib/state'

export default function Page(props) {
  return <State value={props} />
}

export function getStaticProps({ locale }) {
  return { props: state('pages-static-isr', {}, locale), revalidate: false }
}
