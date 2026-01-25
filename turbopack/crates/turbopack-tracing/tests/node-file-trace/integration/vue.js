const Vue = require('vue')
const renderer = require('vue/server-renderer')

const app = Vue.createApp({
  data: () => ({ date: Date.now() }),
  template: `<div>Hello World {{ date }}</div>`,
})
renderer.renderToString(app)
