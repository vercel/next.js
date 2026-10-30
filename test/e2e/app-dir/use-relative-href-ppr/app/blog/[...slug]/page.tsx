import { RelativeHrefs } from '../../relative-hrefs'

export default function BlogPage() {
  // Every path to this page goes through [...slug], so the route has no
  // statically resolvable path: the number of URL parts the page spans is a
  // per-request value, and hrefs resolve against the actual URL pathname.
  // During the fallback-shell prerender the pathname is a placeholder, so
  // the root-relative targets deopt to dynamic holes; only the non-route
  // target, which never reads the base, stays in the shell.
  return (
    <>
      <div id="blog-page">Blog</div>
      <RelativeHrefs
        id="blog-page-hrefs"
        targets={['/blog', '/', 'https://example.com/docs']}
      />
    </>
  )
}
