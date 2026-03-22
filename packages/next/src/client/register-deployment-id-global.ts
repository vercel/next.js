import { getDeploymentId } from '../shared/lib/deployment-id'

const deploymentId = getDeploymentId()
;(globalThis as any).NEXT_DEPLOYMENT_ID = deploymentId
