import Link from 'next/link'
export default function Page() {
  return (
    <>
      <Link id="static" href="/교사-월급-계산기">
        calculator
      </Link>
      <Link id="dynamic" href="/블로그/hello%252Fworld">
        post
      </Link>
      <Link id="prerendered" href="/日本語">
        Japanese
      </Link>
      <Link id="pages" href="/блог/hello%252Fworld">
        pages post
      </Link>
    </>
  )
}
