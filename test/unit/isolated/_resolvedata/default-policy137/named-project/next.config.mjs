import { writeFileSync } from 'node:fs'
writeFileSync(new URL('./named-evaluated', import.meta.url), 'evaluated\n')
export default {}
