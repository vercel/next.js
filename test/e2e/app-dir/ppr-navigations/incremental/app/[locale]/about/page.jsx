import { TestPage } from '../../../components/page'

export const experimental_ppr = true

export default function Page({ params: { locale } }) {
  return <TestPage pathname={`/${locale}/about`} />
}
