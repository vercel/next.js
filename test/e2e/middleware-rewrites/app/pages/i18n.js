import Link from 'next/link'

export default function Home({ locale }) {
  return (
    <div>
      <div className={locale}>{locale}</div>
      <ul>
        <li>
          <Link href="/i18n" locale="en">
            <a id="link-en">Go to en</a>
          </Link>
        </li>
        <li>
          <Link href="/en/i18n" locale={false}>
            <a id="link-en2">Go to en2</a>
          </Link>
        </li>
        <li>
          <Link href="/i18n" locale="ja">
            <a id="link-ja">Go to ja</a>
          </Link>
        </li>
        <li>
          <Link href="/ja/i18n" locale={false}>
            <a id="link-ja2">Go to ja2</a>
          </Link>
        </li>
        <li>
          <Link href="/i18n" locale="fr">
            <a id="link-fr">Go to fr</a>
          </Link>
        </li>
      </ul>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { locale: query.locale },
})
