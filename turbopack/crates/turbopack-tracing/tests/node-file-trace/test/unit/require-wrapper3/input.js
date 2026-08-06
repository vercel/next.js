const reaction = (name) => {
  const res = require(name)
  res.name = name.split('/').pop()
  return res
}

const reactions = {
  repository: {
    publicized: reaction('./dep'),
  },
}
