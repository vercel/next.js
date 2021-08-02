// This script sets up the database to be used for this example application.
// Look at the code to see what is behind the magic
const fs = require('fs')
const readline = require('readline')
const request = require('request')
const { Client, query: Q } = require('faunadb')
const streamToPromise = require('stream-to-promise')

const FAUNA_ADMIN_KEY = process.env.FAUNA_ADMIN_KEY

const MakeLatestEntriesIndex = () =>
  Q.CreateIndex({
    name: 'latestEntries',
    source: Q.Collection('GuestbookEntry'),
    values: [
      {
        field: ['data', 'createdAt'],
        reverse: true,
      },
      {
        field: 'ref',
      },
    ],
  })

const MakeListLatestEntriesUdf = () =>
  Q.Update(Q.Function('listLatestEntries'), {
    // https://docs.fauna.com/fauna/current/api/graphql/functions?lang=javascript#paginated
    body: Q.Query(
      Q.Lambda(
        ['size', 'after', 'before'],
        Q.Let(
          {
            match: Q.Match(Q.Index('latestEntries')),
            page: Q.If(
              Q.Equals(Q.Var('before'), null),
              Q.If(
                Q.Equals(Q.Var('after'), null),
                Q.Paginate(Q.Var('match'), {
                  size: Q.Var('size'),
                }),
                Q.Paginate(Q.Var('match'), {
                  size: Q.Var('size'),
                  after: Q.Var('after'),
                })
              ),
              Q.Paginate(Q.Var('match'), {
                size: Q.Var('size'),
                before: Q.Var('before'),
              })
            ),
          },
          Q.Map(Q.Var('page'), Q.Lambda(['_', 'ref'], Q.Get(Q.Var('ref'))))
        )
      )
    ),
  })

const MakeGuestbookRole = () =>
  Q.CreateRole({
    name: 'GuestbookRole',
    privileges: [
      {
        resource: Q.Collection('GuestbookEntry'),
        actions: {
          read: true,
          write: true,
          create: true,
        },
      },
      {
        resource: Q.Index('latestEntries'),
        actions: {
          read: true,
        },
      },
      {
        resource: Q.Function('listLatestEntries'),
        actions: {
          call: true,
        },
      },
    ],
  })

const MakeGuestbookKey = () =>
  Q.CreateKey({
    role: Q.Role('GuestbookRole'),
  })

const askAdminKey = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question('Please provide the Fauna admin key:\n', (res) => {
      rl.close()
      resolve(res)
    })
  })
}

const importSchema = (adminKey) =>
  streamToPromise(
    fs.createReadStream('./schema.gql').pipe(
      request.post({
        model: 'merge',
        uri: 'https://graphql.fauna.com/import',
        headers: {
          Authorization: `Bearer ${adminKey}`,
        },
      })
    )
  ).then(String)

const findImportError = (msg) => {
  switch (true) {
    case msg.startsWith('Invalid authorization header'):
      return 'You need to provide a secret, closing. Try again'
    case msg.startsWith('Invalid database secret'):
      return 'The secret you have provided is not valid, closing. Try again'
    case !msg.includes('success'):
      return msg
    default:
      return null
  }
}

const main = async () => {
  const adminKey = FAUNA_ADMIN_KEY || (await askAdminKey())
  const importMsg = await importSchema(adminKey)
  const importErrorMsg = findImportError(importMsg)

  if (importErrorMsg) {
    return Promise.reject(new Error(importErrorMsg))
  }

  console.log('1. Successfully imported schema')

  const client = new Client({ secret: adminKey })

  for (const Make of [
    MakeLatestEntriesIndex,
    MakeListLatestEntriesUdf,
    MakeGuestbookRole,
  ]) {
    await client.query(Make())
  }

  const { secret } = await client.query(MakeGuestbookKey())

  console.log('2. Created Fauna resources')

  await fs.promises.writeFile('.env.local', `FAUNADB_SECRET=${secret}\n`)

  console.log('3. Created .env.local file with secret')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
