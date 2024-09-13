import { TestPage } from '../../../components/page'

export default function Page({ params: { locale } }) {
  return <TestPage pathname={`/${locale}/static`} noDynamic />
}
