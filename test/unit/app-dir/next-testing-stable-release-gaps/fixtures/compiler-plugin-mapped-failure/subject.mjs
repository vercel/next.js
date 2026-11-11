export function failFromSubject() {
  const message = 'mapped plugin subject failure'

  throw new Error(message)
}

export const transformStages = 'original'
