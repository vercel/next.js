import {BaseStore, getOrCreateStore} from 'next-mobx-wrapper'
import {observable, flow} from 'mobx'

import {delay} from '../utils'
import {getUsers, getUser, getUserRepositories} from '../api'

class Store extends BaseStore {
  @observable users = []
  @observable userRegistry = new Map()
  @observable userRepositoryRegistry = new Map()

  fetchUsers = flow(function * () {
    if (this.users.length) {
      return
    }

    yield delay(2000)

    const usersPromise = yield getUsers()

    this.users.replace(usersPromise)
  })

  fetchUser = flow(function * (id) {
    if (this.userRegistry.has(id)) {
      return
    }

    yield delay(2000)

    const userPromise = yield getUser(id)

    this.userRegistry.set(id, userPromise)
  })

  fetchUserRepositories = flow(function * (id) {
    if (this.userRepositoryRegistry.has(id)) {
      return
    }

    yield delay(2000)

    const userRepositoriesPromise = yield getUserRepositories(id)

    this.userRepositoryRegistry.set(id, userRepositoriesPromise)
  })

  getUserById = id => {
    return this.userRegistry.get(id)
  }

  getUserRepositoriesById = id => {
    return this.userRepositoryRegistry.get(id)
  }
}

// Make sure the store’s unique name
// AND getCounterStore, counterStore must be same formula
// Example: getUserStore => userStore
// Example: getProductStore => productStore
export const getUserStore = getOrCreateStore('userStore', Store)
