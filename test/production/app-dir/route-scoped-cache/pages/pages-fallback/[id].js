import { useRouter } from 'next/router'
import { state, State } from '../../lib/state'

export default function Page(props) {
  return useRouter().isFallback ? (
    <p id="fallback">Loading</p>
  ) : (
    <State value={props} />
  )
}

export function getStaticPaths() {
  return {
    paths: ['en', 'fr'].map((locale) => ({ params: { id: 'known' }, locale })),
    fallback: true,
  }
}

export function getStaticProps({ params, locale }) {
  return { props: state('pages-fallback', params, locale), revalidate: 3600 }
}
