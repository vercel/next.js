import os from 'os'

// A default max-timeout of 90 seconds is allowed
// per test we should aim to bring this down though
jest.setTimeout(os.platform() === 'win32' ? 120 * 1000 : 90 * 1000)
