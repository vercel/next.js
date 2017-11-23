/**
 * A class to handle signing in and out and caching session data in sessionStore
 *
 * Note: We usewindow.XMLHttpRequest() here rather than fetch because fetch() uses
 * Service Workers and they cannot share cookies with the browser session
 * yet (!) so if we tried to get or pass the CSRF token it would mismatch.
 */
export default class Session {
  constructor ({req} = {}) {
    this._session = {}
    this._user = {}
    try {
      if (req) {
        // If running on server we can access the server side environment
        this._session = {
          csrfToken: req.connection._httpMessage.locals._csrf
        }
        // If the session is associated with a user add user object to session
        if (req.user) {
          this._session.user = req.user
        }

        return
      }

      // If running on client, attempt to load session from localStorage
      this._session = this._getLocalStore('session')
    } catch (err) {
      // Handle if error reading from localStorage or server state is safe to
      // ignore (will just cause session data to be fetched by ajax)
    }
  }

  static async getCsrfToken () {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        return reject(Error('This method should only be called on the client'))
      }

      let xhr = new window.XMLHttpRequest()
      xhr.open('GET', '/auth/csrf', true)
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            const responseJson = JSON.parse(xhr.responseText)
            resolve(responseJson.csrfToken)
          } else {
            reject(Error('Unexpected response when trying to get CSRF token'))
          }
        }
      }
      xhr.onerror = () => {
        reject(Error('XMLHttpRequest error: Unable to get CSRF token'))
      }
      xhr.send()
    })
  }

  // We can't do async requests in the constructor so access is via asyc method
  // This allows us to use XMLHttpRequest when running on the client to fetch it
  // Note: We use XMLHttpRequest instead of fetch so auth cookies are passed
  async getSession (forceUpdate) {
    // If running on the server, return session as will be loaded in constructor
    if (typeof window === 'undefined') {
      return new Promise(resolve => {
        resolve(this._session)
      })
    }

    // If force update is set, clear data from store
    if (forceUpdate === true) {
      this._removeLocalStore('session')
    }

    // Attempt to load session data from sessionStore on every call
    this._session = this._getLocalStore('session')

    // If session data exists, has not expired AND forceUpdate is not set then
    // return the stored session we already have.
    if (this._session && Object.keys(this._session).length > 0 && this._session.expires && this._session.expires > Date.now()) {
      return new Promise(resolve => {
        resolve(this._session)
      })
    }

    // If we don't have session data, or it's expired, or forceUpdate is set
    // to true then revalidate it by fetching it again from the server.
    return new Promise((resolve, reject) => {
      let xhr = new window.XMLHttpRequest()
      xhr.open('GET', '/auth/session', true)
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            // Update session with session info
            this._session = JSON.parse(xhr.responseText)

            // Set a value we will use to check this client should silently
            // revalidate based on the value of clientMaxAge set by the server
            this._session.expires = Date.now() + this._session.clientMaxAge

            // Save changes to session
            this._saveLocalStore('session', this._session)

            resolve(this._session)
          } else {
            reject(Error('XMLHttpRequest failed: Unable to get session'))
          }
        }
      }
      xhr.onerror = () => {
        reject(Error('XMLHttpRequest error: Unable to get session'))
      }
      xhr.send()
    })
  }

  signin (email) {
    // Sign in to the server
    return new Promise(async (resolve, reject) => {
      if (typeof window === 'undefined') {
        return reject(Error('This method should only be called on the client'))
      }

      // Make sure we have session in memory
      this._session = await this.getSession()

      // Make sure we have the latest CSRF Token in our session
      this._session.csrfToken = await Session.getCsrfToken()

      let xhr = new window.XMLHttpRequest()
      xhr.open('POST', '/auth/email/signin', true)
      xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status !== 200) {
            return reject(Error('XMLHttpRequest error: Error while attempting to signin'))
          }

          return resolve(true)
        }
      }
      xhr.onerror = () => {
        return reject(Error('XMLHttpRequest error: Unable to signin'))
      }
      xhr.send('_csrf=' + encodeURIComponent(this._session.csrfToken) + '&' +
                'email=' + encodeURIComponent(email))
    })
  }

  signout () {
    // Signout from the server
    return new Promise(async (resolve, reject) => {
      if (typeof window === 'undefined') {
        return reject(Error('This method should only be called on the client'))
      }

      let xhr = new window.XMLHttpRequest()
      xhr.open('POST', '/auth/signout', true)
      xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
      xhr.onreadystatechange = async() => {
        if (xhr.readyState === 4) {
          // @TODO We aren't checking for success, just completion

          // Update local session data
          this._session = await this.getSession(true)

          resolve(true)
        }
      }
      xhr.onerror = () => {
        reject(Error('XMLHttpRequest error: Unable to signout'))
      }
      xhr.send('_csrf=' + encodeURIComponent(this._session.csrfToken))
    })
  }

  // The Web Storage API is widely supported, but not always available (e.g.
  // it can be restricted in private browsing mode, triggering an exception).
  // We handle that silently by just returning null here.
  _getLocalStore (name) {
    try {
      return JSON.parse(window.localStorage.getItem(name))
    } catch (err) {
      return null
    }
  }
  _saveLocalStore (name, data) {
    try {
      window.localStorage.setItem(name, JSON.stringify(data))
      return true
    } catch (err) {
      return false
    }
  }
  _removeLocalStore (name) {
    try {
      window.localStorage.removeItem(name)
      return true
    } catch (err) {
      return false
    }
  }

}
