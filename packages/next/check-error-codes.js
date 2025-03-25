const os = require('os')
const path = require('path')
const fs = require('fs/promises')

const errorsDir = path.join(__dirname, '.errors')

// This script checks for new error codes in .errors directory and consolidates them into errors.json.
// It will fail if new error codes are found, after consolidating them, to ensure error codes are
// properly reviewed and committed.
async function main() {
  // Check if .errors directory exists
  try {
    await fs.access(errorsDir)
  } catch {
    process.exit(0)
  }

  let existingErrors = {}

  // Load existing errors.json if it exists
  try {
    existingErrors = JSON.parse(
      await fs.readFile(path.join(__dirname, 'errors.json'), 'utf8')
    )
  } catch {
    // Start fresh if errors.json doesn't exist
  }

  // Calculate next error code
  const nextInitialCode =
    Object.keys(existingErrors).length > 0
      ? Math.max(...Object.keys(existingErrors).map(Number)) + 1
      : 1

  // Process new error files
  const errorFiles = [...(await fs.readdir(errorsDir))].map((file) =>
    path.join(errorsDir, file)
  )

  let newErrorCount = 0
  for (const file of errorFiles) {
    const { errorMessage } = JSON.parse(await fs.readFile(file, 'utf8'))

    // Check if message already exists
    const existingCode = Object.entries(existingErrors).find(
      ([_, msg]) => msg === errorMessage
    )?.[0]

    if (!existingCode) {
      // Only add if message is new
      const code = nextInitialCode + newErrorCount
      existingErrors[code] = errorMessage
      newErrorCount++
    }
  }

  // Write updated errors and cleanup
  await fs.writeFile(
    path.join(__dirname, 'errors.json'),
    JSON.stringify(existingErrors, null, 2) +
      // Formatters would add these anyway
      os.EOL
  )

  await fs.rm(errorsDir, { recursive: true, force: true })
  process.exit(1)
}

main().catch(console.error)
