export default async function Page() {
  const { default: defaultValue } = await import('../../lib/default-module')
  return <div>{defaultValue}</div>
}
