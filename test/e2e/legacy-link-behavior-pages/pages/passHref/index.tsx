import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        <CustomComponent>About</CustomComponent>
      </Link>
    </>
  )
}

function CustomComponent(props: any) {
  return <a {...props} />
}
