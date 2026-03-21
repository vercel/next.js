// These imports are written for the page's final location under
// pages/docs/_handlers, not this source file's current page-sources folder.
import RewrittenRouteComponent from '../../../components/RewrittenRouteComponent'
import RouteRenderer from '../../../components/RouteRenderer'

export default function ExampleRewrittenPage({ requiredComponentName }) {
  return (
    <RouteRenderer
      titleId="rewritten-route-page"
      title="Rewritten route page"
      requiredComponentName={requiredComponentName}
      componentMap={{ RewrittenRouteComponent }}
    />
  )
}

export async function getStaticProps() {
  return {
    props: {
      requiredComponentName: 'RewrittenRouteComponent',
    },
  }
}
