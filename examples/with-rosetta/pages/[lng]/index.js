import Link from 'next/link'
import useI18n from '../../hooks/use-i18n'
import { languages } from '../../lib/i18n'

const HomePage = ({ lng }) => {
  const i18n = useI18n(lng)

  console.log(lng)

  return (
    <div>
      <h1>{i18n.t('intro.welcome', 'Peter')}</h1>
      <h3>{i18n.t('intro.text')}</h3>
      <Link href="/de">
        <a
          style={{
            lineHeight: 1.5,
            textAlign: 'center',
            boxSizing: 'border-box',
            backgroundColor: 'green',
            textDecoration: 'inherit',
            padding: '10px',
            border: '0 solid #e2e8f0',
            color: 'white',
            borderRadius: '.25rem',
            borderWidth: '1px',
          }}
        >
          Change language SSG
        </a>
      </Link>
    </div>
  )
}

export async function getStaticProps({ params }) {
  return {
    props: { lng: params.lng },
  }
}

export async function getStaticPaths() {
  return {
    paths: languages.map(l => ({ params: { lng: l } })),
    fallback: true,
  }
}

export default HomePage
