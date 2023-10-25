import { NonSuspensePage } from '../../../../components/page'

export default function Page() {
  return <NonSuspensePage />
}

export const generateStaticParams = async () => {
  return []
}
