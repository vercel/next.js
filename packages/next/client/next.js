import { initNext, version, router, emitter, render, renderError } from './'

window.next = { version, router, emitter, render, renderError }

initNext().catch(console.error)
