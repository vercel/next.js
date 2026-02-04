import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function Page() {
  async function redirectAction() {
    'use server'
    redirect('/root-layout-b')
  }

  return (
    <>
      <Link href="../root-layout-b" id="link-to-b">
        To b
      </Link>
      <form action={redirectAction}>
        <button id="action-redirect-to-b">Redirect to B</button>
      </form>
    </>
  )
}
