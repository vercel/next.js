import ClientComponent from './component'

export default async function Page() {
  return <ClientComponent config={process.env} />
}
