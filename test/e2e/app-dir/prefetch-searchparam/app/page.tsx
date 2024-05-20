import Link from 'next/link'

export default async function Page({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  return (
    <div>
      <Link id="1" href="?foo=bar1">
        1: Click here and refresh page (?foo=bar1)
      </Link>
      <Link id="2" href="?foo=bar2">
        2. Click here (?foo=bar2)
      </Link>
      <Link id="3" href="/">
        3. Click here wtf (/)
      </Link>
      <p>{JSON.stringify(searchParams)}</p>
    </div>
  )
}
