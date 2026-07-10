'use client'

// The module's exports object is a real promise (unlike thenable exports
// created by exporting a function named `then`).
module.exports = new Promise((resolve) => {
  setTimeout(() => resolve({}), 100)
})
