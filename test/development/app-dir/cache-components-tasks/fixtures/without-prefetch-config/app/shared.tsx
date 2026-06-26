import { cookies } from 'next/headers'
import { connection } from 'next/server'

function immediate() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

export async function Static({ label }: { label: string }) {
  await immediate()
  await immediate()
  console.log(`after immediate - static - ${label}`)
  return <div>Static - {label}</div>
}

export async function Runtime({ label }: { label: string }) {
  await cookies()
  console.log(`after cookies - ${label}`)
  await immediate()
  await immediate()
  console.log(`after immediate - runtime - ${label}`)
  return <div>Runtime - {label}</div>
}

export async function Dynamic({ label }: { label: string }) {
  await connection()
  console.log(`after connection - ${label}`)
  await immediate()
  await immediate()
  console.log(`after immediate - dynamic - ${label}`)
  return <div>Dynamic - {label}</div>
}
