// The real /featured static page. At runtime the `beforeFiles` rewrite
// hijacks /featured requests and sends them through /[teamSlug], so this
// page is never actually served — but its presence on the filesystem
// matters: it makes /featured a static sibling of /[teamSlug], which is
// what makes the rewrite case observable to the router (a request for
// /featured could not have arrived at /[teamSlug] under normal routing).
export default function FeaturedPage() {
  return (
    <main>
      <h1 id="featured-page">FEATURED</h1>
    </main>
  )
}
