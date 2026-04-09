import SharedPage from '../../shared-page'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-cache'

export default function Page() {
  return <SharedPage isDynamic={true} />
}
