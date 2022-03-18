import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  return (
    <div>
      <p className="title">Home Page</p>
      <div />
      <Link href="/rewrites/rewrite-to-ab-test">
        <a>A/B test homepage</a>
      </Link>
      <div />
      <Link href="/rewrites/rewrite-me-to-about">
        <a>Rewrite me to about</a>
      </Link>
      <div />
      <Link href="/rewrites/rewrite-me-to-vercel">
        <a>Rewrite me to Vercel</a>
      </Link>
      <div />
      <Link href="/rewrites/rewrite-me-external-twice">
        <a>Redirect me to Vercel (but with double reroutes)</a>
      </Link>
      <div />
      <Link href="/rewrites/rewrite-me-without-hard-navigation?message=refreshed">
        <a id="link-with-rewritten-url">Rewrite me without a hard navigation</a>
      </Link>
      <div />
      <Link href="/rewrites/about?override=external">
        <a id="override-with-external-rewrite">Rewrite me to external site</a>
      </Link>
      <div />
      <Link href="/rewrites/about?override=internal">
        <a id="override-with-internal-rewrite">Rewrite me to internal path</a>
      </Link>
      <div />
      <a
        href=""
        id="link-to-shallow-push"
        onClick={(e) => {
          e.preventDefault()
          router.push(
            '/rewrites?path=rewrite-me-without-hard-navigation&message=refreshed',
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
