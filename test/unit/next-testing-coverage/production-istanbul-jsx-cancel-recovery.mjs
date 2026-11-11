import { runProductionIstanbulTypedCancelRecovery } from './production-istanbul-typed-cancel-recovery.mjs'

await runProductionIstanbulTypedCancelRecovery({
  fixtureFile: 'production-jsx-cancel-pristine.json',
  fixturePrefix: '.next-istanbul-spec-cancel-',
})
