import { revalidatePath } from 'next/cache'
import { Button } from './Button'

export default function Page() {
  async function revalidate() {
    'use server'
    revalidatePath('/revalidate/%40slot')
  }

  return (
    <div>
      Random: {Math.random()}
      <Button revalidate={revalidate} />
    </div>
  )
}
