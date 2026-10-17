'use cache'

import { locale } from 'next/root-params'

export default async function Page() {
  return <div id="cached-root-param">{`Locale: ${await locale()}`}</div>
}
