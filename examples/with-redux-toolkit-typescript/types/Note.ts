export type Note = {
  title: string
  content: string
}

export type PersistedNote = Note & {
  id: string
}
