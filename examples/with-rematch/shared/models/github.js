import fetch from 'isomorphic-unfetch'

const github = {
  state: {
    users: [],
    isLoading: false
  }, // initial state
  reducers: {
    requestUsers (state) {
      return {
        users: [],
        isLoading: true
      }
    },
    receiveUsers (state, payload) {
      return {
        isLoading: false,
        users: payload
      }
    }
  },
  effects: {
    // handle state changes with impure functions.
    // use async/await for async actions
    async fetchUsers (payload, rootState) {
      try {
        this.requestUsers()
        const response = await fetch('https://api.github.com/users')
        const users = await response.json()
        this.receiveUsers(users)
      } catch (err) {
        console.log(err)
        this.receiveUsers([])
      }
    }
  }
}

export default github
