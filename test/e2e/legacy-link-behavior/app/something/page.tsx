import Link from 'next/link'
// import MyLink from './my-link'

export default function Page() {
  return (
    <>
      {/* <MyLink href="/about">
        <RSC />
      </MyLink> */}
      <Link href="/about" legacyBehavior passHref>
        <>
          {/* <RSC /> */}
          <RSC />
        </>
      </Link>
    </>
  )
}

function RSC() {
  return <div>rsc</div>
}
