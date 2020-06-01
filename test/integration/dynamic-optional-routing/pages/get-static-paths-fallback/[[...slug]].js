import { useRouter } from 'next/router'

export async function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: [] },
      },
      {
        params: { slug: ['p1'] },
      },
      {
        params: { slug: ['p2', 'p3'] },
      },
    ],
    fallback: true,
  }
}

export async function getStaticProps({ params }) {
  return { props: { params } }
}

export default function Index(props) {
  const router = useRouter()
  return (
    <div id="route">
      gsp fallback route:{' '}
      {props.params?.slug === undefined
        ? 'undefined'
        : `[${props.params.slug.join('|')}]`}
      {router.isFallback ? ' is fallback' : ' is not fallback'}
    </div>
  )
}
