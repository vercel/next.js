import fs from 'fs'
import path from 'path'

export const revalidate = 3

export default async function Page() {
  const shouldError = (
    await fs.promises.readFile(
      path.join(process.cwd(), 'app/isr-error-handling/error.txt'),
      'utf8'
    )
  ).trim()

  if (shouldError === 'yes') {
    throw new Error('intentional error')
  }

  return (
    <div>
      <p id="now">{Date.now()}</p>
    </div>
  )
}
