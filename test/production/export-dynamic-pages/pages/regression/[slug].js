import { useRouter } from 'next/router'

function Regression() {
  const { asPath } = useRouter()
  if (typeof window !== 'undefined') {
    window.__AS_PATHS = [...new Set([...(window.__AS_PATHS || []), asPath])]
  }
  return <div id="asPath">{asPath}</div>
}

Regression.getInitialProps = () => ({})

export default Regression
