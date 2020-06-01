export const isDate = (dateString) =>
  /\d{4}-(?:0[1-9]|1[0-2])-(?:[0-2]\d|3[01])/.test(dateString)
