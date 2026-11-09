import * as page from './page.js'

globalThis.evaluationOrder.push('peer')

export const peer = () => `peer ${page.name}`
