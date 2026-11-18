import { getDeploymentId } from '../shared/lib/deployment-id'

const deploymentId = getDeploymentId()
// TODO(as-any): pre-existing cast, not yet reviewed
// eslint-disable-next-line @next/internal/no-as-any
;(globalThis as any).NEXT_DEPLOYMENT_ID = deploymentId
