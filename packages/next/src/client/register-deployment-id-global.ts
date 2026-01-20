import { getDeploymentId } from '../shared/lib/deployment-id'
;(globalThis as any).NEXT_DEPLOYMENT_ID = getDeploymentId()
