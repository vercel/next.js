import { TestPage } from '../../../components/test-page'

export const experimental_ppr = true

export default async function Page(props) {
  const params = await props.params

  const { locale } = params

  return <TestPage pathname={`/${locale}/about`} />
}
