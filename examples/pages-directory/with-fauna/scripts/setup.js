// This script sets up the database to be used for this example application.
// Look at the code to see what is behind the magic
const fs = require('fs')
const readline = require('readline')
const request = require('request')
const { Client, query: Q } = require('faunadb')
const streamToPromise = require('stream-to-promise')
const { resolveDbDomain } = require('../lib/constants')

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

const isDatabasePrepared = ({ client }) =>
  client.query(Q.Exists(Q.Index('latestEntries')))

const resolveAdminKey = () => {
  if (process.env.FAUNA_ADMIN_KEY) {
    return Promise.resolve(process.env.FAUNA_ADMIN_KEY)
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve, reject) => {
    rl.question('Please provide the Fauna admin key:\n', (res) => {
      rl.close()

      if (!res) {
        return reject(
          new Error('You need to provide a key, closing. Try again')
        )
      }

      resolve(res)
    })
  })
}

const importSchema = (adminKey) => {
  let domain = resolveDbDomain().replace('db', 'graphql')
  return streamToPromise(
    fs.createReadStream('./schema.gql').pipe(
      request.post({
        model: 'merge',
        uri: `https://${domain}/import`,
        headers: {
          Authorization: `Bearer ${adminKey}`,
        },
      })
    )
  ).then(String)
}

const findImportError = (msg) => {
  switch (true) {
    case msg.startsWith('Invalid database secret'):
      return 'The secret you have provided is not valid, closing. Try again'
    case !msg.includes('success'):
      return msg
    default:
      return null
  }
}

const main = async () => {
  const adminKey = await resolveAdminKey()

  const client = new Client({
    secret: adminKey,
    domain: resolveDbDomain(),
  })

  if (await isDatabasePrepared({ client })) {
    return console.info(
      'Fauna resources have already been prepared. ' +
        'If you want to install it once again, please, create a fresh database and re-run the script with the other key'
    )
  }

  const importMsg = await importSchema(adminKey)
  const importErrorMsg = findImportError(importMsg)

  if (importErrorMsg) {
    return Promise.reject(new Error(importErrorMsg))
  }

  console.log('- Successfully imported schema')

  for (const Make of [
    MakeLatestEntriesIndex,
    MakeListLatestEntriesUdf,
    MakeGuestbookRole,
  ]) {
    await client.query(Make())
  }

  console.log('- Created Fauna resources')

  if (process.env.FAUNA_ADMIN_KEY) {
    // Assume it's a Vercel environment, no need for .env.local file
    return
  }

  const { secret } = await client.query(MakeGuestbookKey())

  await fs.promises.writeFile('.env.local', `FAUNA_CLIENT_SECRET=${secret}\n`)

  console.log('- Created .env.local file with secret')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
