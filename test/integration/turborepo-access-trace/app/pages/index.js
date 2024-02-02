import { fetchData } from '../lib/fetch-data'

import('../lib/my-component').then((mod) => {
  console.log(mod.Button)
})

export default function Page() {
  return 'index page'
}

export function getStaticProps() {
  fetchData()

  return {
    props: {},
  }
}
