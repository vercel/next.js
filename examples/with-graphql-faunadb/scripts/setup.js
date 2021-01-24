// This script sets up the database to be used for this example application.
// Look at the code to see what is behind the magic
const faunadb = require('faunadb')
const q = faunadb.query
const request = require('request')
const fs = require('fs')
const streamToPromise = require('stream-to-promise')

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
})

// In order to set up a database, we need an admin key, so let's ask the user for a key.
readline.question(`Please provide the FaunaDB admin key\n`, (adminKey) => {
  // A graphql schema can be imported in override or merge mode: 'https://docs.fauna.com/fauna/current/api/graphql/endpoints#import'
  const options = {
    model: 'merge',
    uri: 'https://graphql.fauna.com/import',
    headers: { Authorization: `Bearer ${adminKey}` },
  }
  const stream = fs.createReadStream('./schema.gql').pipe(request.post(options))

  streamToPromise(stream)
    .then((res) => {
      const readableResult = res.toString()
      if (readableResult.startsWith('Invalid authorization header')) {
        console.error('You need to provide a secret, closing. Try again')
        return readline.close()
      } else if (readableResult.startsWith('Invalid database secret')) {
        console.error(
          'The secret you have provided is not valid, closing. Try again'
        )
        return readline.close()
      } else if (readableResult.includes('success')) {
        console.log('1. Successfully imported schema')
        return readline.close()
      }
    })
    .catch((err) => {
      console.error(err)
      console.error(`Could not import schema, closing`)
    })
    .then((res) => {
      // The GraphQL schema is important, this means that we now have a GuestbookEntry Collection and an entries index.
      // Then we create a token that can only read and write to that index and collection
      var client = new faunadb.Client({ secret: adminKey })
      return client
        .query(
          q.CreateRole({
            name: 'GuestbookRole',
            privileges: [
              {
                resource: q.Collection('GuestbookEntry'),
                actions: { read: true, write: true, create: true },
              },
              {
                resource: q.Index('entries'),
                actions: { read: true },
              },
            ],
          })
        )
        .then((res) => {
          console.log(
            '2. Successfully created role to read and write guestbook entries'
          )
        })
        .catch((err) => {
          if (err.toString().includes('instance already exists')) {
            console.log('2. Role already exists.')
          } else {
            throw err
          }
        })
    })
    .catch((err) => {
      console.error(err)
      console.error(`Failed to create role, closing`)
    })
    .then((res) => {
      // The GraphQL schema is important, this means that we now have a GuestbookEntry Collection and an entries index.
      // Then we create a token that can only read and write to that index and collection
      var client = new faunadb.Client({ secret: adminKey })
      return client
        .query(
          q.CreateKey({
            role: q.Role('GuestbookRole'),
          })
        )
        .then((res) => {
          console.log('3. Created key to use in client')
          const envFile =
            'NEXT_PUBLIC_FAUNADB_SECRET=' +
            res.secret +
            '\n' +
            'NEXT_PUBLIC_FAUNADB_GRAPHQL_ENDPOINT=https://graphql.fauna.com/graphql'

          fs.writeFile('.env.local', envFile, (err) => {
            if (err) {
              console.error(
                'Failed to create .env.local file. Copy the .env.local.example file and provide the secret shown below:'
              )
              console.log(res.secret)
            } else {
              console.log('4. Created .env.local file with secret\n')
              fs.readFile('.env.local', (err, data) => {
                if (!err) {
                  console.log('.env.local:\n')
                  console.log(data.toString('utf-8'))
                }
              })
            }
          })
        })
    })
    .catch((err) => {
      console.error(err)
      console.error(`Failed to create key, closing`)
    })
})
