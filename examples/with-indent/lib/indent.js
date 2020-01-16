let _queue = []
let _config = {}
let _timeout
let _actor

export const register = ({ space = '', provider = '', input = '' }) => {
  _config = { space, provider, input}
}

/**
 * @param {Actor} actor - The {@link Actor} performing the action
 */
export const setActor = actor => {
  _actor = actor
}

const _flush = () => {
  const { space, provider, input } = _config

  console.log(`‣ flush: ${_queue.length} events`)

  _queue.forEach(event => {
    if (!event.actor) {
      if (_actor) {
        event.actor = _actor
      } else {
        event.actor = { id: 'anonymous' }
      }
    }

    if (!event.timestamp) {
      event.timestamp = new Date().toISOString()
    }

    if (!space) throw new Error('‣ indent.register: missing `space`')
    if (!provider) throw new Error('‣ indent.register: missing `provider`')
    if (!input) throw new Error('‣ indent.register: missing `input`')

    fetch(`https://audit.indentapis.com/v1/inputs/${space}/${provider}/${input}:write`, {
      method: 'POST',
      body: JSON.stringify(event),
    })
  })

  _queue = []
}

/**
 * Resource related to the Event.
 * @typedef {Object} Resource
 * @property {string} id - The IRN for the resource
 * @property {number} kind - The IRN for the kind of resource
 * @property {string} displayName - The display name of the resource
 * @property {string} altIds - The IRNs for alternate identifiers (e.g. email)
 */

 /**
 * Actor related to the Event.
 * @typedef {Object} Actor
 * @property {string} id - The IRN for the resource
 * @property {number} kind - The IRN for the kind of resource
 * @property {string} displayName - The display name of the resource
 * @property {string} altIds - The IRNs for alternate identifiers (e.g. email)
 * @property {string} email - The email for the Actor
 */

/**
 * @param {string} event - The action being performed
 * @param {Resource[]} resources - The {@link Resource}s being acted upon
 * @param {Actor} actor - The {@link Actor} performing the action
 * @param {Object} extend - The object to extend the generated audit.v1.Event
 */
export const write = ({ event, actor, resources, timestamp }) => {
  console.log(`‣ write: ${event}`)
  _queue.push({ timestamp, event, actor, resources })

  if (_timeout) {
    clearTimeout(_timeout)
  }

  _timeout = setTimeout(_flush, 500)
}

export const pageview = url => {
  write({
    event: 'page_viewed',
    resources: [{
      kind: 'http/url',
      id: url
    }]
  })
}