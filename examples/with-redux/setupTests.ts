import '@testing-library/jest-dom'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(__dirname, true, { info: () => null, error: console.error })
