import { RouterHooksFixtures } from '../../components/router-hooks-fixtures'

export default function Page() {
  return <RouterHooksFixtures />
}

export const getStaticProps = () => {
  return { props: {} }
}
