import StartPageControls from '../../components/StartPageControls'
import RouteRenderer from '../../components/RouteRenderer'

export default function DocsCatchAllPage({ mode, requiredComponentName }) {
  if (mode === 'start') {
    return (
      <main>
        <h1>Docs start page</h1>
        <p>
          This tab should already be open before the rewritten page is added.
        </p>
        <StartPageControls />
      </main>
    )
  }

  return (
    // Keep the catch-all and rewritten page on the same renderer so a stale
    // rewrite adoption fails as a missing component instead of silently
    // rendering the wrong page.
    <RouteRenderer
      title="Catch-all page"
      requiredComponentName={requiredComponentName}
      componentMap={{}}
    />
  )
}

export async function getStaticProps({ params }) {
  const slug = params.slug.join('/')

  if (slug === 'start') {
    return {
      props: {
        // Boot the browser on a stable public route before the handler exists.
        mode: 'start',
      },
    }
  }

  return {
    props: {
      mode: 'catch-all',
      requiredComponentName: null,
    },
  }
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: ['start'] } }, { params: { slug: ['example'] } }],
    fallback: false,
  }
}
