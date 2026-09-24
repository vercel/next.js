// The test harness uses empty strings for unset environment variables.
for (const name of ['NODE_ENV', 'NEXT_RUNTIME']) {
  if (process.env[name] === '') {
    delete process.env[name]
  }
}

process.on('exit', () => {
  console.log(
    `UPGRADE_ENVIRONMENT=${JSON.stringify({
      NODE_ENV: process.env.NODE_ENV ?? null,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME ?? null,
    })}`
  )
})
