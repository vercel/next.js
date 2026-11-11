import * as subject from '../../subject.mjs'
import * as counter from '../../counter.mjs'
counter.increment()
globalThis.secondSetupInput = { subject, counter }
