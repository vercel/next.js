import Values from '../../values'
export default function ActivityPage(props) {
  return (
    <aside data-parallel-page="activity">
      <Values role="activity" {...props} />
    </aside>
  )
}
