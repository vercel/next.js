/**
 * Constants for Next.js Stats Action
 * 
 * Defines working directories and paths for stats collection.
 * 
 * FIX: Added error handling for directory creation to prevent ENOENT
 * when temporary directories cannot be created due to permissions
 * or disk space issues.
 * 
 * Related issue: #134429
 */

const path = require('path')
const os = require('os')
const fs = require('fs')

const benchTitle = 'Page Load Tests'

function getTempRoot() {
  const tempRoot = process.env.RUNNER_TEMP || os.tmpdir()

  try {
    // Ensure the temp directory exists
    if (!fs.existsSync(tempRoot)) {
      fs.mkdirSync(tempRoot, { recursive: true })
    }
    return tempRoot
  } catch (err) {
    console.error(`Failed to create temp directory ${tempRoot}:`, err.message)
    // Fall back to system temp directory
    return os.tmpdir()
  }
}

function createWorkDir() {
  const tempRoot = getTempRoot()
  
  try {
    // Create a unique temporary directory
    const workDir = fs.mkdtempSync(path.join(tempRoot, 'next-stats-'))
    
    // Verify directory was created successfully
    if (!fs.existsSync(workDir)) {
      throw new Error(`Failed to create work directory at ${workDir}`)
    }
    
    return workDir
  } catch (err) {
    console.error('Failed to create work directory:', err.message)
    // Fall back to a known writable directory
    const fallbackDir = path.join(os.tmpdir(), `next-stats-${Date.now()}`)
    fs.mkdirSync(fallbackDir, { recursive: true })
    return fallbackDir
  }
}

// Create directories with error handling
const workDir = createWorkDir()
const pnpmStoreDir = path.join(workDir, '.pnpm-store')
const mainRepoDir = path.join(workDir, 'main-repo')
const diffRepoDir = path.join(workDir, 'diff-repo')
const statsAppDir = path.join(workDir, 'stats-app')
const diffingDir = path.join(workDir, 'diff')
const allowedConfigLocations = [
  './',
  '.stats-app',
  'test/.stats-app',
  '.github/.stats-app',
]

// ========== FIX: Add error handling for directory creation ==========
// Problem: Directory creation failures cause complete workflow failure
// Solution: Try-catch for each directory, continue if one fails
// This makes the action more resilient to permission issues
const directories = [pnpmStoreDir, mainRepoDir, diffRepoDir, statsAppDir, diffingDir]
for (const dir of directories) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`Created directory: ${dir}`)
    }
  } catch (err) {
    // Log warning but don't throw - other directories might still work
    console.error(` Warning: Failed to create directory ${dir}:`, err.message)
    console.error(`   This may affect stats collection but won't stop the workflow`)
    // Continue with next directory instead of failing completely
  }
}

module.exports = {
  benchTitle,
  workDir,
  pnpmStoreDir,
  diffingDir,
  mainRepoDir,
  diffRepoDir,
  statsAppDir,
  allowedConfigLocations,
}
