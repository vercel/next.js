'use strict'

const Schema = use('Schema')

class TokensSchema extends Schema {
  up () {
    this.create('tokens', table => {
      table.increments()
      table.integer('user_id').unsigned().references('id').inTable('users')
      table.string('token', 40).notNullable().unique()
      table.string('type', 80).notNullable()
      table.boolean('is_revoked').defaultTo(false)
      table.timestamps()
    })
  }

  down () {
    this.drop('tokens')
  }
}

module.exports = TokensSchema
