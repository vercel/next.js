import data from 'a-missing-module-for-error-testing'

export default function Page() {
  return <p>error page {String(data)}</p>
}
