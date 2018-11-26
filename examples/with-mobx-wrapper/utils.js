export const delay = (ms = 4000) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * ms)));
