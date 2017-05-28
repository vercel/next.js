import Link from 'next/link'

const DynamicPage = ({ text }) => (
  <div id='dynamic-page'>
    <div>
      <Link href='/'>
        <a>Go Back</a>
      </Link>
    </div>
    <p>{ text }</p>
  </div>
)

DynamicPage.getInitialProps = ({ query }) => {
  return { text: query.text }
}

export default DynamicPage
