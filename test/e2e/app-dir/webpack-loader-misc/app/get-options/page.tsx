import report from '../../input.options'

export default function Page() {
  return <pre id="report">{JSON.stringify(report)}</pre>
}
