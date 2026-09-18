import { getApiExportChecks } from '../lib/api-exports'

export async function getServerSideProps() {
  return { props: { checks: getApiExportChecks() } }
}

export default function Page({ checks }) {
  return (
    <ul>
      {Object.entries(checks).map(([name, passed]) => (
        <li key={name} data-api={name} data-passed={passed} />
      ))}
    </ul>
  )
}
