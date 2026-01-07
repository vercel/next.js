import { promises } from 'fs'
import { join } from 'path'

const DEPLOYMENT_ID_FILE = 'deployment-id.txt'

export async function writeDeploymentId(
  distDir: string,
  deploymentId: string
): Promise<void> {
  const deploymentIdPath = join(distDir, DEPLOYMENT_ID_FILE)
  await promises.writeFile(deploymentIdPath, deploymentId, 'utf8')
}
