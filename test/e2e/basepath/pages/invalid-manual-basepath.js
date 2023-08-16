import Link from 'next/link'
import { useRouter } from 'next/router'

const Page = () => (
  <>
    <Link href={`${useRouter().basePath}/other-page`} id="other-page-link">
      <h1>Hello World</h1>
    </Link>
  </>
)

export default Page
