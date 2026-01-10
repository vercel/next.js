'use server'

import Link from 'next/link'
import { revalidateTag } from 'next/cache'

const RevalidateViaPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) => {
  const { tag } = await searchParams
  revalidateTag(tag as any, 'max')

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <pre>Tag [{tag}] has been revalidated</pre>
      <Link href="/" id="home">
        To Home
      </Link>
    </div>
  )
}

export default RevalidateViaPage
