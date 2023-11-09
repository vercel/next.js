import { Button } from '../Button'
import { revalidatePath } from 'next/cache'

export default async function Page() {
  async function revalidate() {
    'use server'
    revalidatePath('/revalidate')
  }
  return (
    <div>
      slot Random: {Math.random()}
      <Button revalidate={revalidate} random={Math.random()} />
    </div>
  )
}
