import SharedPage from '../../shared-page'

export default async function Page() {
  'use cache'
  return <SharedPage isDynamic={false} />
}
