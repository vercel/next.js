import fetch from '../fetch'

/**
|--------------------------------------------------
| This GraphQL query returns an array of Guestbook
| entries complete with both the provided and implicit
| data attributes.
|
| Learn more about GraphQL: https://graphql.org/learn/
|--------------------------------------------------
*/
export const getGuestbookEntries = () => {
  const query = `query Entries($size: Int) {
    entries(_size: $size) {
      data {
        _id
        _ts
        twitter_handle
        story
      }
      after
    }
  }`
  const size = 100
  return new Promise((resolve, reject) => {
    fetch(process.env.faunaDbGraphQlEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.faunaDbSecret}`,
        'Content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { size },
      }),
    })
      .then(r => r.json())
      .then(data => {
        console.log(data)
        resolve(data)
      })
      .catch(error => {
        console.log(error)
        reject(error)
      })
  })
}

/**
|--------------------------------------------------
| This GraphQL mutation creates a new GuestbookEntry
| with the requisite twitter handle and story arguments.
|
| It returns the stored data and includes the unique
| identifier (_id) as well as _ts (time created).
|
| The guestbook uses the _id value as the unique key
| and the _ts value to sort and display the date of
| publication.
|
| Learn more about GraphQL mutations: https://graphql.org/learn/queries/#mutations
|--------------------------------------------------
*/
export const createGuestbookEntry = async (twitterHandle, story) => {
  const query = `mutation CreateGuestbookEntry($twitterHandle: String!, $story: String!) {
    createGuestbookEntry(data: {
      twitter_handle: $twitterHandle,
      story: $story
    }) {
      _id
      _ts
      twitter_handle
      story
    }
  }`
  return new Promise((resolve, reject) => {
    fetch(process.env.faunaDbGraphQlEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.faunaDbSecret}`,
        'Content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { twitterHandle, story },
      }),
    })
      .then(r => r.json())
      .then(data => {
        console.log(data)
        resolve(data)
      })
      .catch(error => {
        console.log(error)
        reject(error)
      })
  })
}
