import { cookies } from 'next/headers'

import * as React from 'react'

export default function page() {
  return <div> hello world </div>
}

export async function getServerSideProps() {
  return {}
}
