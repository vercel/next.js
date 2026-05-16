import def, { named, identity } from './module.js'

const nested = {
  def,
  named,
}

export const nested2 = {
  def,
  named,
}

const nested_with_identity = identity({
  def,
  named,
})

export const nested_with_identity2 = identity({
  def,
  named,
})

const double_nested = {
  nested: {
    def,
    named,
  },
}

export const double_nested2 = {
  nested: {
    def,
    named,
  },
}

const double_nested_with_identity = {
  nested: identity({
    def,
    named,
  }),
}

export const double_nested_with_identity2 = {
  nested: identity({
    def,
    named,
  }),
}

export {
  nested,
  nested_with_identity,
  double_nested,
  double_nested_with_identity,
}
