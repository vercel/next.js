import React from 'react'

export function Page({ page }) {
  return <p data-page={page}>{page}</p>
}

export function createGetServerSideProps(page: string) {
  return async function getServerSideProps(ctx) {
    const output = ctx.req.headers['x-invoke-output'] ?? null
    return { props: { page, output } }
  }
}
