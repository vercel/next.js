'use server'

import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)

export async function saveData(formData: FormData) {
  const file = formData.get('file') as File
  const filePath = path.join('./', file.name)

  const buffer = await file.arrayBuffer()

  await writeFile(filePath, Buffer.from(buffer))

  const payload = {
    email: formData.get('email'),
    file: filePath,
  }

  console.log('payload', payload)

  return payload
}
