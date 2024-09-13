const Vue = require("vue");
const renderer = require("vue-server-renderer").createRenderer();

const app = new Vue({
  data: () => ({ date: Date.now() }),
  template: `<div>Hello World {{ date }}</div>`,
});
renderer.renderToString(app);
