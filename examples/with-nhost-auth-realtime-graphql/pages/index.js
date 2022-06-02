import { useState } from 'react'
import { useSubscription, useMutation, gql } from '@apollo/client'
import { PrivateRoute } from '../components/private-route'
import { nhost } from '../utils/nhost'

const INSERT_ITEM = gql`
  mutation insertItem($item: items_insert_input!) {
    insert_items_one(object: $item) {
      id
    }
  }
`

const S_GET_ITEMS = gql`
  subscription sGetItems {
    items {
      id
      name
    }
  }
`

const DELETE_ITEM = gql`
  mutation deleteItem($item_id: uuid!) {
    delete_items_by_pk(id: $item_id) {
      id
    }
  }
`

function InsertItem() {
  const [name, setName] = useState('')
  const [insertItem] = useMutation(INSERT_ITEM)

  async function handleFormSubmit(e) {
    e.preventDefault()
    try {
      insertItem({
        variables: {
          item: {
            name,
          },
        },
      })
    } catch (error) {
      console.error(error)
      return alert('Error inserting item')
    }

    setName('')
  }

  return (
    <div style={{ padding: '10px' }}>
      <form onSubmit={handleFormSubmit}>
        <div>
          <input
            type="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <button type="submit">Insert item</button>
        </div>
      </form>
    </div>
  )
}

function ListItems() {
  const { loading, error, data } = useSubscription(S_GET_ITEMS)
  const [deleteItem] = useMutation(DELETE_ITEM)

  async function handleDeleteItem(itemId) {
    try {
      deleteItem({
        variables: {
          item_id: itemId,
        },
      })
    } catch (error) {
      console.log(error)
      return alert('Error deleting item')
    }
  }

  if (loading && !data) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div>Error loading items</div>
  }

  const { items } = data

  return (
    <div style={{ padding: '10px' }}>
      {items.map((item) => {
        return (
          <li key={item.id}>
            {item.name} [
            <span onClick={() => handleDeleteItem(item.id)}>delete</span>]
          </li>
        )
      })}
    </div>
  )
}

function Home() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <pre>{nhost.auth.user().display_name}</pre>
        <div style={{ paddingLeft: '10px' }}>
          <button onClick={() => nhost.auth.logout()}>logout</button>
        </div>
      </div>
      <h1>Dashboard</h1>
      <InsertItem />
      <ListItems />
    </div>
  )
}

export default PrivateRoute(Home)
