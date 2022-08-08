export { getStaticProps } from '../lib/utils'

export default function ImportGsp({ gsp }) {
  return `import-${gsp}`
}
