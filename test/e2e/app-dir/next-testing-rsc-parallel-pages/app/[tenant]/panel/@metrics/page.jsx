import Values from '../values'
export default function MetricsPage(props) {
  return (
    <aside data-parallel-page="metrics">
      <Values role="metrics" {...props} />
    </aside>
  )
}
