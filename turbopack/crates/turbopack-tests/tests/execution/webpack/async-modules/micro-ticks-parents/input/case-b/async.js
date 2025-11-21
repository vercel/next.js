import { report } from '../tick'

report('async before')
await 0
report('async middle')
await 0
report('async after')
