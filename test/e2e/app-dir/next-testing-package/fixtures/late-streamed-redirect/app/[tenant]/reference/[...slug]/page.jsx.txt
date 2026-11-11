import Subject from './subject'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export default function Page(props) {
  return <Subject {...props} />
}
