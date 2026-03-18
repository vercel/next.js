import { whatever } from 'next/root-params'

export default async function Page() {
  return <>{await whatever()}</>
}
