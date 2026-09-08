// Recipes carry Rust-owned contents by handle. Only JavaScript byte consumers
// hydrate them; paths and destination mapping do not need the contents.
function serializeFile(file) {
  const { artifact, data, ...metadata } = file
  if (artifact !== undefined) return { ...metadata, artifact }
  return {
    ...metadata,
    data: data === null ? null : Buffer.from(data).toString('base64'),
  }
}

async function loadFiles(files, request) {
  const pending = files.filter((file) => file.artifact !== undefined)
  if (!pending.length) return
  const contents = await request({
    kind: 'load',
    artifacts: pending.map((file) => file.artifact),
  })
  for (let index = 0; index < pending.length; index++) {
    pending[index].data = Buffer.from(contents[index], 'base64')
    // The plugin can mutate the Buffer in place or replace it. Never reuse the
    // original handle after handing those bytes to JavaScript.
    delete pending[index].artifact
  }
}

module.exports = { serializeFile, loadFiles }
