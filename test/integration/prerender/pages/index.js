import Link from 'next/link'

export async function getStaticProps() {
  // throw new Error('oops from getStaticProps')
  return {
    props: { world: 'world', time: new Date().getTime() },
    // bad-prop
    revalidate: 2,
  }
}

const Page = ({ world, time }) => {
  return (
    <>
      {/* <div id='after-change'>idk</div> */}
      <p>hello {world}</p>
      <span>time: {time}</span>
      <Link href="/non-json/[p]" as="/non-json/1" id="non-json">
        to non-json
      </Link>
      <br />
      <Link href="/another?hello=world" as="/another/?hello=world" id="another">
        to another
      </Link>
      <br />
      <Link href="/something" id="something">
        to something
      </Link>
      <br />
      <Link href="/normal" id="normal">
        to normal
      </Link>
      <br />
      <Link href="/blog/[post]" as="/blog/post-1" id="post-1">
        to dynamic
      </Link>
      <Link href="/blog/[post]" as="/blog/post-100" id="broken-post">
        to broken
      </Link>
      <Link
        href="/blog/[post]"
        as="/blog/post-999"
        prefetch={false}
        id="broken-at-first-post"
      >
        to broken at first
      </Link>
      <br />
      <Link
        href="/blog/[post]/[comment]"
        as="/blog/post-1/comment-1"
        id="comment-1"
      >
        to another dynamic
      </Link>
      <Link href="/catchall/[...slug]" as="/catchall/first" id="to-catchall">
        to catchall
      </Link>
      <br />
      <Link href="/index" id="to-nested-index">
        to nested index
      </Link>
      <br />
      <Link href="/lang/[lang]/about?lang=en" as="/about" id="to-rewritten-ssg">
        to rewritten static path page
      </Link>
      <br />
      <Link
        href="/catchall-optional/[[...slug]]"
        as="/catchall-optional"
        id="catchall-optional-root"
      >
        to optional catchall root
      </Link>
      <Link
        href="/catchall-optional/[[...slug]]"
        as="/catchall-optional/value"
        id="catchall-optional-value"
      >
        to optional catchall page /value
      </Link>
      <br />
      <Link href="/dynamic/[slug]" as="/dynamic/[first]" id="dynamic-first">
        to dynamic [first] page
      </Link>
      <Link href="/dynamic/[slug]" as="/dynamic/[second]" id="dynamic-second">
        to dynamic [second] page
      </Link>
      <br />
      <Link
        href="/catchall-explicit/[...slug]"
        as="/catchall-explicit/[first]/[second]"
        id="catchall-explicit-string"
      >
        to catchall-explicit [first]/[second] page
      </Link>
      <Link
        href="/catchall-explicit/[...slug]"
        as="/catchall-explicit/[third]/[fourth]"
        id="catchall-explicit-object"
      >
        to catchall-explicit [third]/[fourth] page
      </Link>
    </>
  )
}

export default Page
