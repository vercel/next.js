import findUp from 'next/dist/compiled/find-up'

export async function hasVercelConfigFiles(dir: string) {
  const vercelJsonPath = await findUp('vercel.json', { cwd: dir })
  const dotVercelPath = await findUp('.vercel', { cwd: dir })
  return !!(vercelJsonPath || dotVercelPath)
}
