import { fetchData } from '../lib/fetch-data'

export const config = {
  unstable_includeFiles: ['include-me/*'],
  unstable_excludeFiles: ['public/exclude-me/**/*'],
}

export default function Page() {
  return 'index page'
}

export function getStaticProps() {
  fetchData()

  return {
    props: {},
  }
}
