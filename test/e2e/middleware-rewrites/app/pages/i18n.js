import Link from 'next/link'

export default function Home({ locale }) {
  return (
    <div>
      <div className={locale}>{locale}</div>
      <ul>
        <li>
          <Link href="/i18n" locale="en" id="link-en">
            Go to en
          </Link>
        </li>
        <li>
          <Link href="/en/i18n" locale={false} id="link-en2">
            Go to en2
          </Link>
        </li>
        <li>
          <Link href="/i18n" locale="ja" id="link-ja">
            Go to ja
          </Link>
        </li>
        <li>
          <Link href="/ja/i18n" locale={false} id="link-ja2">
            Go to ja2
          </Link>
        </li>
        <li>
          <Link href="/i18n" locale="fr" id="link-fr">
            Go to fr
          </Link>
        </li>
      </ul>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { locale: query.locale },
})
