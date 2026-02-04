export async function after({
  distDir,
  projectDir,
}: {
  distDir: string
  projectDir: string
}) {
  throw new Error('error after production build')
}
