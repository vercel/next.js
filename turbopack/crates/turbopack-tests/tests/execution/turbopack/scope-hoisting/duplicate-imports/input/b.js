import './a.js'
import shared from './shared.js'
;(globalThis.duplicateImportsLog ??= []).push(['b', shared])
