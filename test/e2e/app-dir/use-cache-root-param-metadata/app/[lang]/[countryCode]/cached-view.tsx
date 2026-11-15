import { lang } from 'next/root-params'

export async function CachedView() {
  return <span>{await lang()}</span>
}
