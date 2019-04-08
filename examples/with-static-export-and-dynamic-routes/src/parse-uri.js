import { first, startsWith, trimStart } from 'lodash'
import uriTemplates from 'uri-templates'

import routes from '../redirects'

// Annoyingly, URI templates as defined by [RFC 6570](https://tools.ietf.org/html/rfc6570) is not
// the format that Express and Netlify use. The following code converts the URIs from one format to
// another.
//
// Express and Netlify
// "/customers/:customerId/ration"
//
// RFC 6570
// "/customer/{customerId}/ration",
const convertRouteToStandardFormat = url =>
  url
    .split(`/`)
    .map(fragment =>
      startsWith(fragment, `:`) ? `{${trimStart(fragment, `:`)}}` : fragment
    )
    .join(`/`)

const routeTemplates = routes
  // Get the "external" URI from each route. This is what will be in the URL bar of a browser
  .map(route => route.externalURL)
  // Convert them from 🤷 to RFC 6570
  .map(convertRouteToStandardFormat)
  // Ensure that we can pull the queryParams off of any route.
  .map(route => `${route}{?queryParams*}`)
  // Create URI templates for each route
  .map(uriTemplates)
  // Add a default template for the base route
  .concat(uriTemplates(`/{?queryParams*}`))

const parseUri = uri => {
  // Remove trailing slash from URI, if present
  const [path, queryParams] = uri.split(`?`)
  const cleanPath = path === `/` ? path : path.replace(/\/$/, ``)
  const cleanURI = `${cleanPath}?${queryParams}`

  const matchingRoutes = routeTemplates
    .map(template => template.fromUri(cleanURI))
    .filter(Boolean)

  return first(matchingRoutes)
}

export default parseUri
