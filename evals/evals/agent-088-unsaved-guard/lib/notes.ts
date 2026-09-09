export interface Note {
  id: string
  title: string
  body: string
}

const notes: Note[] = [
  {
    id: '1',
    title: 'Launch checklist',
    body: 'Draft the launch email and confirm the pricing table.',
  },
  {
    id: '2',
    title: 'Meeting notes',
    body: 'Follow up with design about the empty states.',
  },
  {
    id: '3',
    title: 'Ideas',
    body: 'Keyboard shortcuts for the editor toolbar.',
  },
]

export function listNotes(): Note[] {
  return notes
}

export function getNote(id: string): Note | undefined {
  return notes.find((n) => n.id === id)
}
