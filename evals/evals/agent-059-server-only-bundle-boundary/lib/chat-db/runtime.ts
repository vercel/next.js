type Column = {
  kind: 'text' | 'integer'
  name: string
}

export function text(name: string): Column {
  return { kind: 'text', name }
}

export function integer(name: string): Column {
  return { kind: 'integer', name }
}

export function pgTable(name: string, columns: Record<string, Column>) {
  const registry = globalThis as typeof globalThis & {
    __fixtureDatabaseTables?: string[]
  }

  registry.__fixtureDatabaseTables ??= []
  registry.__fixtureDatabaseTables.push(name)

  return { columns, name }
}
