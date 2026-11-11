import { runProductionIstanbulTypedCancelRecovery } from './production-istanbul-typed-cancel-recovery.mjs'

await runProductionIstanbulTypedCancelRecovery({
  fixtureFile: 'production-typescript-cancel-pristine.json',
  fixturePrefix: '.next-istanbul-typed-spec-cancel-',
})
