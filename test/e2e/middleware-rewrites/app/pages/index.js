import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  return (
    <div>
      <p className="title">Home Page</p>
      <div />
      <Link href="/rewrite-to-ab-test">A/B test homepage</Link>
      <div />
      <Link
        href="/rewrite-me-to-about?override=internal"
        id="rewrite-me-to-about"
      >
        Rewrite me to about
      </Link>
      <div />
      <Link
        href="/rewrite-to-beforefiles-rewrite"
        id="rewrite-to-beforefiles-rewrite"
      >
        Rewrite me to beforeFiles Rewrite
      </Link>
      <div />
      <Link
        href="/rewrite-to-afterfiles-rewrite"
        id="rewrite-to-afterfiles-rewrite"
      >
        Rewrite me to afterFiles Rewrite
      </Link>
      <div />
      <Link href="/rewrite-me-to-vercel">Rewrite me to Vercel</Link>
      <div />
      <Link href="/rewrite-me-external-twice">
        Redirect me to Vercel (but with double reroutes)
      </Link>
      <div />
      <Link
        href="/rewrite-me-without-hard-navigation?message=refreshed"
        id="link-with-rewritten-url"
      >
        Rewrite me without a hard navigation
      </Link>
      <div />
      <Link href="/about?override=external" id="override-with-external-rewrite">
        Rewrite me to external site
      </Link>
      <div />
      <Link href="/about?override=internal" id="override-with-internal-rewrite">
        Rewrite me to internal path
      </Link>
      <div />
      <Link href="/rewrite-to-static" id="rewrite-to-static">
        Rewrite me to static
      </Link>
      <div />
      <Link href="/fallback-true-blog/rewritten" id="rewrite-to-ssr">
        Rewrite me to /about (SSR)
      </Link>
      <div />
      <Link href="/ssg" id="normal-ssg-link">
        normal SSG link
      </Link>
      <div />
      <a
        href=""
        id="link-to-shallow-push"
        onClick={(e) => {
          e.preventDefault()
          router.push(
            '/?path=rewrite-me-without-hard-navigation&message=refreshed',
            undefined,
            { shallow: true }
          )
        }}
      >
        Do not rewrite me
      </a>
    </div>
  )
}

export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}
