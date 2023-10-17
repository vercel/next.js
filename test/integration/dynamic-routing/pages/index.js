import Link from 'next/link'
import { useRouter } from 'next/router'

if (typeof window !== 'undefined') {
  window.caughtWarns = []
  const origWarn = window.console.warn
  window.console.warn = function (...args) {
    window.caughtWarns.push(args)
    origWarn(...args)
  }
}

const Page = () => {
  return (
    <div>
      <h3>My blog</h3>
      <Link href="/[name]" as="/post-1" id="view-post-1">
        View post 1
      </Link>
      <br />
      <Link href="/[name]" as="/post-1#my-hash" id="view-post-1-hash-1">
        View post 1 (hash)
      </Link>
      <br />
      <Link href="/post-1#my-hash" id="view-post-1-hash-1-href-only">
        View post 1 (hash only href)
      </Link>
      <br />
      <Link
        href="/post-1?hidden=value"
        as="/post-1"
        id="view-post-1-hidden-query"
      >
        View post 1 (href query)
      </Link>
      <br />
      <Link
        href={{
          hash: 'my-hash',
          pathname: '/[name]',
          query: { name: 'post-1' },
        }}
        id="view-post-1-hash-1-interpolated"
      >
        View post 1 (hash interpolated)
      </Link>
      <br />
      <Link href="/post-1" id="view-post-1-no-as">
        View post 1 (no as)
      </Link>
      <br />
      <Link
        href={{
          pathname: '/[name]',
          query: { name: 'post-1' },
        }}
        id="view-post-1-interpolated"
      >
        View post 1 (interpolated)
      </Link>
      <br />
      <Link
        href={{
          pathname: '/[name]',
          query: { another: 'value' },
        }}
        id="view-post-1-interpolated-incorrectly"
      >
        View post 1 (interpolated incorrectly)
      </Link>
      <br />
      <Link
        href={{
          pathname: '/[name]',
          query: { name: 'post-1', another: 'value' },
        }}
        id="view-post-1-interpolated-more-query"
      >
        View post 1 (interpolated additional query)
      </Link>
      <br />
      <Link
        href="/[name]/comments"
        as="/post-1/comments"
        id="view-post-1-comments"
      >
        View post 1 comments
      </Link>
      <br />
      <Link
        href="/[name]/[comment]"
        as="/post-1/comment-1"
        id="view-post-1-comment-1"
      >
        View comment 1 on post 1
      </Link>
      <br />
      <Link href="/post-1/comment-1" id="view-post-1-comment-1-no-as">
        View comment 1 on post 1 (no as)
      </Link>
      <br />
      <Link
        href={{
          pathname: '/[name]/[comment]',
          query: { name: 'post-1', comment: 'comment-1' },
        }}
        id="view-post-1-comment-1-interpolated"
      >
        View comment 1 on post 1 (interpolated)
      </Link>
      <br />
      <Link href="/added-later/first" id="added-later-link">
        /added-later/first
      </Link>
      <br />
      <Link
        href="/blog/[post]/comment/[id]"
        as="/blog/321/comment/123"
        id="view-nested-dynamic-cmnt"
      >
        View comment 123 on blog post 321
      </Link>
      <br />
      <Link
        href="/[name]?fromHome=true"
        as="/post-1?fromHome=true"
        id="view-post-1-with-query"
      >
        View post 1 with query
      </Link>
      <br />
      <Link
        href="/on-mount/[post]"
        as="/on-mount/test-w-hash#item-400"
        id="view-dynamic-with-hash"
      >
        View test with hash
      </Link>
      <br />
      <Link
        href="/p1/p2/all-ssr/[...rest]"
        as="/p1/p2/all-ssr/hello"
        id="catch-all-single"
      >
        Catch-all route (single)
      </Link>
      <br />
      <Link
        href="/p1/p2/all-ssr/[...rest]"
        as="/p1/p2/all-ssr/hello1/hello2"
        id="catch-all-multi"
      >
        Catch-all route (multi)
      </Link>
      <br />
      <Link
        href="/p1/p2/all-ssr/[...rest]"
        as="/p1/p2/all-ssr/hello1%2F/he%2Fllo2"
        id="catch-all-enc"
      >
        Catch-all route (encoded)
      </Link>
      <br />
      <Link
        href="/p1/p2/all-ssr/[...rest]"
        as="/p1/p2/all-ssr/:42"
        id="catch-all-colonnumber"
      >
        Catch-all route :42
      </Link>
      <br />
      <Link
        href="/p1/p2/all-ssg/[...rest]"
        as="/p1/p2/all-ssg/hello"
        id="ssg-catch-all-single"
      >
        Catch-all route (single)
      </Link>
      <br />
      <Link
        href={{
          pathname: '/p1/p2/all-ssg/[...rest]',
          query: { rest: ['hello'] },
        }}
        id="ssg-catch-all-single-interpolated"
      >
        Catch-all route (single interpolated)
      </Link>
      <br />
      <Link
        href="/p1/p2/all-ssg/[...rest]"
        as="/p1/p2/all-ssg/hello1/hello2"
        id="ssg-catch-all-multi"
      >
        Catch-all route (multi)
      </Link>
      <br />
      <Link href="/p1/p2/all-ssg/hello1/hello2" id="ssg-catch-all-multi-no-as">
        Catch-all route (multi)
      </Link>
      <br />
      <Link
        href={{
          pathname: '/p1/p2/all-ssg/[...rest]',
          query: { rest: ['hello1', 'hello2'] },
        }}
        id="ssg-catch-all-multi-interpolated"
      >
        Catch-all route (multi interpolated)
      </Link>
      <br />
      <Link
        href="/p1/p2/nested-all-ssg/[...rest]"
        as="/p1/p2/nested-all-ssg/hello"
        id="nested-ssg-catch-all-single"
      >
        Nested Catch-all route (single)
      </Link>
      <br />
      <Link
        href="/p1/p2/nested-all-ssg/[...rest]"
        as="/p1/p2/nested-all-ssg/hello1/hello2"
        id="nested-ssg-catch-all-multi"
      >
        Nested Catch-all route (multi)
      </Link>
      <br />
      <Link href="/d/dynamic-1" id="dynamic-route-no-as">
        Dynamic route no as
      </Link>
      <p id="query">{JSON.stringify(Object.keys(useRouter().query))}</p>
    </div>
  )
}

export default Page
