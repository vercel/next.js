import Link from 'next/link'
import useI18n from '../hooks/use-i18n'

const Contact = ({ lng }) => {
  const i18n = useI18n(lng)

  return (
    <div>
      <h1>{i18n.t('contact.email')}</h1>
      <Link href={{ pathname: '/contact', query: { lng: 'de' } }}>
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
          Change language SSR
        </a>
      </Link>
    </div>
  )
}

export async function getServerSideProps({ query }) {
  return {
    props: {
      lng: query.lng || 'en',
    }, // will be passed to the page component as props
  }
}

export default Contact
