import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { LinkAccordion } from '../../../components/link-accordion'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await connection()
  if (id === 'moved') {
    redirect('/destination')
  }
  return (
    <>
      <h1 id="item">Item {id}</h1>
      <LinkAccordion href="/item/moved" prefetch={false}>
        /item/moved
      </LinkAccordion>
    </>
  )
}
