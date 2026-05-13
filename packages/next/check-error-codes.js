const os = require('os')
const path = require('path')
const fs = require('fs/promises')

const errorsDir = path.join(__dirname, '.errors')

/** @typedef {Record<string, string>} ErrorCodesObject */

function ensureSequentialCodes(/** @type {ErrorCodesObject} */ errors) {
  /** @type {ErrorCodesObject} */
  const result = {}
  let isSequential = true

  let i = 1
  for (const [code, message] of Object.entries(errors)) {
    const expectedCode = i + ''
    if (code !== expectedCode) {
      isSequential = false
    }
    result[expectedCode] = message
    i += 1
  }

  return /** @type {const} */ ([result, isSequential])
}

/** @returns {Promise<ErrorCodesObject>} */
async function readErrorsFile() {
  // Load existing errors.json if it exists
  const contents = await fs
    .readFile(path.join(__dirname, 'errors.json'), 'utf8')
    .catch(() => null)
  if (contents === null) {
    // Start fresh if errors.json doesn't exist
    return {}
  }
  return JSON.parse(contents)
}

// This script checks for new error codes in .errors directory and consolidates them into errors.json.
// It will fail if new error codes are found, after consolidating them, to ensure error codes are
// properly reviewed and committed.
async function main() {
  // Check if .errors directory exists
  const errorsDirExists = await fs.access(errorsDir).then(
    () => true,
    () => false
  )
  if (!errorsDirExists) {
    // There's no new errors, but we still need to make sure the existing ones are sequential.
    const [existingErrors, isSequential] = ensureSequentialCodes(
      await readErrorsFile()
    )
    if (!isSequential) {
      console.error(
        'ERROR: non-sequential error codes were found. Writing re-numbered version'
      )
      // Write updated errors and cleanup
      await fs.writeFile(
        path.join(__dirname, 'errors.json'),
        JSON.stringify(existingErrors, null, 2) +
          // Formatters would add these anyway
          os.EOL
      )
      process.exit(1)
    }

    process.exit(0)
  }

  const [existingErrors, isSequential] = ensureSequentialCodes(
    await readErrorsFile()
  )
  if (!isSequential) {
    console.error(
      'Warning: existing non-sequential error codes were re-numbered while adding new error codes'
    )
  }

  // Calculate next error code
  const nextInitialCode = Object.keys(existingErrors).length + 1

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
