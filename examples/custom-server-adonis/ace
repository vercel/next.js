'use strict'

/*
|--------------------------------------------------------------------------
| Ace Commands
|--------------------------------------------------------------------------
|
| The ace file is just a regular Javascript file but with no extension. You
| can call `node ace` followed by the command name and it just works.
|
| Also you can use `adonis` followed by the command name, since the adonis
| global proxy all the ace commands.
|
*/

const { Ignitor } = require('@adonisjs/ignitor')

new Ignitor(require('@adonisjs/fold'))
  .appRoot(__dirname)
  .fireAce()
  .catch(console.error)
