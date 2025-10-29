const { resolve } = require('path')
const fs = require('fs')
const { readdir } = fs.promises

async function getPosts() {
  const postsDirectory = resolve(process.cwd(), '_posts')
  const postFiles = await readdir(postsDirectory)
  return postFiles
}

getPosts().catch(console.error)
