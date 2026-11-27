// `valueOf` isn't a constructor, so this throws instead of returning `process.env`
try {
  console.log(new process.env.valueOf())
} catch {}
