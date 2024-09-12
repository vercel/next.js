import { PagesRouteModule } from '../../server/route-modules/pages/module.compiled'
import { RouteKind } from '../../server/route-kind'
import { hoist } from './helpers'

// Import the app and document modules.
import * as document from 'VAR_MODULE_DOCUMENT'
import * as app from 'VAR_MODULE_APP'

// Import the userland code.
import * as userland from 'VAR_USERLAND'

// Re-export the component (should be the default export).
export default hoist(userland, 'default')

// Re-export methods.
export const getStaticProps = hoist(userland, 'getStaticProps')
export const getStaticPaths = hoist(userland, 'getStaticPaths')
export const getServerSideProps = hoist(userland, 'getServerSideProps')
export const config = hoist(userland, 'config')
export const reportWebVitals = hoist(userland, 'reportWebVitals')

// Re-export legacy methods.
export const unstable_getStaticProps = hoist(
  userland,
  'unstable_getStaticProps'
)
export const unstable_getStaticPaths = hoist(
  userland,
  'unstable_getStaticPaths'
)
export const unstable_getStaticParams = hoist(
  userland,
  'unstable_getStaticParams'
)
export const unstable_getServerProps = hoist(
  userland,
  'unstable_getServerProps'
)
export const unstable_getServerSideProps = hoist(
  userland,
  'unstable_getServerSideProps'
)

// Create and export the route module that will be consumed.
export const routeModule = new PagesRouteModule({
  definition: {
    kind: RouteKind.PAGES,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    // The following aren't used in production.
    bundlePath: '',
    filename: '',
  },
  components: {
    // default export might not exist when optimized for data only
    App: app.default,
    Document: document.default,
  },
  userland,
})
