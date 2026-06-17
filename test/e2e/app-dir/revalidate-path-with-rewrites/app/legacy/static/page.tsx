import SharedPage from '../../shared-page'

export const revalidate = 900
export const fetchCache = 'force-cache'

export default function Page() {
  return <SharedPage isDynamic={false} />
}
