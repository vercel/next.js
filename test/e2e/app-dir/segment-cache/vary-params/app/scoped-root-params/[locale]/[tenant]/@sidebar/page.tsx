import { tenant } from 'next/root-params'

export default async function Sidebar() {
  return <aside>{`Tenant: ${await tenant()}`}</aside>
}
