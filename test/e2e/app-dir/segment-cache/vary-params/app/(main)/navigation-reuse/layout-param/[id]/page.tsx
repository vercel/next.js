import { connection } from 'next/server'
import { ParamDisplay } from './param-display'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()
  const { id } = await params
  return (
    <>
      <p id="page-id">{`Page id: ${id}`}</p>
      <ParamDisplay />
    </>
  )
}
