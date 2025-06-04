import { report } from '../tick'
import './a'
import './d'

report('async before')
await 0
report('async middle')
await 0
report('async after')
