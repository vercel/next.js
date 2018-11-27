export const delay = (ms = 3000) =>
  new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * ms)))
