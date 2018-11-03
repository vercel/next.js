# Custom Koa Server example

## How it works

This example injects the `renderjsx` method to egg `context` object.

You must pass the `pathname` when you use `this.ctx.renderjsx` for rendering, which means the exact path of page in `pages` .
