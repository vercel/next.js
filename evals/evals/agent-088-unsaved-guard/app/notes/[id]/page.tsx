import { notFound } from 'next/navigation'
import { getNote } from '@/lib/notes'
import { NoteEditor } from './note-editor'

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const note = getNote(id)
  if (!note) notFound()
  return <NoteEditor id={note.id} title={note.title} initialBody={note.body} />
}
