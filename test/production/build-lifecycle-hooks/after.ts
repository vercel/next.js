import fs from 'fs/promises'

export async function after({
  distDir,
  projectDir,
}: {
  distDir: string
  projectDir: string
}) {
  try {
    console.log(`Using distDir: ${distDir}`)
    console.log(`Using projectDir: ${projectDir}`)

    await new Promise((resolve) => setTimeout(resolve, 5000))

    const files = await fs.readdir(distDir, { recursive: true })
    console.log(`Total files in ${distDir} folder: ${files.length}`)
  } catch (err) {
    console.error(`Error reading ${distDir} directory:`, err)
  }
}
