import './b.js'
import shared from './shared.js'
;(globalThis.duplicateImportsLog ??= []).push(['c', shared])
