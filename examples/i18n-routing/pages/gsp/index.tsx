import type { GetStaticProps, InferGetStaticPropsType } from 'next'

import Link from 'next/link'
import { useRouter } from 'next/router'
import LocaleSwitcher from '../../components/locale-switcher'

type GspPageProps = InferGetStaticPropsType<typeof getStaticProps>

export default function GspPage(props: GspPageProps) {
  const router = useRouter()
  const { defaultLocale } = router

  return (
    <div>
      <h1>getStaticProps page</h1>
      <p>Current locale: {props.locale}</p>
      <p>Default locale: {defaultLocale}</p>
      <p>Configured locales: {JSON.stringify(props.locales)}</p>

      <LocaleSwitcher />

      <Link href="/gsp/first">To dynamic getStaticProps page</Link>
      <br />

      <Link href="/gssp">To getServerSideProps page</Link>
      <br />

      <Link href="/">To index page</Link>
      <br />
    </div>
  )
}

type Props = {
  locale?: string
  locales?: string[]
}

export const getStaticProps: GetStaticProps<Props> = async ({
  locale,
  locales,
}) => {
  return {
    props: {
      locale,
      locales,
    },
  }
}
