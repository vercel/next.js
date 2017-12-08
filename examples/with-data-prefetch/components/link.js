import PropTypes from 'prop-types'
import Link from 'next/link'
import Router from 'next/router'
import { execOnce, warn } from 'next/dist/lib/utils'
import exact from 'prop-types-exact'
import { format, resolve, parse } from 'url'

// extend default next/link to customize the prefetch behaviour
export default class LinkWithData extends Link {
  // re defined Link propTypes to add `withData`
  static propTypes = exact({
    href: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    as: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    prefetch: PropTypes.bool,
    replace: PropTypes.bool,
    shallow: PropTypes.bool,
    passHref: PropTypes.bool,
    scroll: PropTypes.bool,
    withData: PropTypes.bool,
    children: PropTypes.oneOfType([
      PropTypes.element,
      (props, propName) => {
        const value = props[propName]

        if (typeof value === 'string') {
          execOnce(warn)(`Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`)
        }

        return null
      }
    ]).isRequired
  });

  // our custom prefetch method
  async prefetch () {
    // if the prefetch post is not defined do nothing
    if (!this.props.prefetch) return
    // if we're running server side do nothin
    if (typeof window === 'undefined') return

    // get the target URL, it could be an string or
    // an object with pathname and query
    const url =
      typeof this.props.href !== 'string'
        ? format(this.props.href)
        : this.props.href

    // get our current pathname
    const { pathname } = window.location
    // combine the pathname and URL to calculate the href
    const href = resolve(pathname, url)
    // get the new page query, if the href is not an string get it
    // from the object, eitherway parse the url to get it
    const { query } =
      typeof this.props.href !== 'string'
        ? this.props.href
        : parse(url, true)
    // prefetch the JS component (and get it)
    const Component = await Router.prefetch(href)

    // if withData prop is defined and Component exists and has getInitialProps
    if (this.props.withData && Component && Component.getInitialProps) {
      // if we already cached prefetched the data don't do it again
      if (window.sessionStorage.getItem(url)) return
      // create our context object with the href, query and an new isVirtualCall
      const ctx = { pathname: href, query, isVirtualCall: true }
      // get component props from prefetched page
      const props = await Component.getInitialProps(ctx)
      // save props on sessionStorage using the full url (pathname + query)
      // as key and the returned posts as value
      window.sessionStorage.setItem(url, JSON.stringify(props))
    }
  }
}
