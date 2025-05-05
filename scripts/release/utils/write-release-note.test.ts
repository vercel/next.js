import { writeReleaseNote } from './write-release-note'

describe('writeReleaseNote', () => {
  it('should generate a release note with multiple credits', () => {
    const changelogs = {
      next: {
        version: '15.0.0',
        changelog: '### Minor Changes\n\n- Added new feature #12345',
      },
      'create-next-app': {
        version: '15.0.0',
        changelog: '### Patch Changes\n\n- Fixed bug #67890',
      },
    }
    const credits = ['foo', 'bar', 'baz']

    const expected = `## \`next@15.0.0\`

### Minor Changes

- Added new feature #12345

## \`create-next-app@15.0.0\`

### Patch Changes

- Fixed bug #67890

## Credits

Huge thanks to @foo, @bar, and @baz for helping!`

    expect(writeReleaseNote(changelogs, credits)).toBe(expected)
  })

  it('should generate a release note with a single credit', () => {
    const changelogs = {
      next: {
        version: '15.0.0',
        changelog: '### Minor Changes\n\n- Added new feature #12345',
      },
      'create-next-app': {
        version: '15.0.0',
        changelog: '### Patch Changes\n\n- Fixed bug #67890',
      },
    }
    const credits = ['foo']

    const expected = `## \`next@15.0.0\`

### Minor Changes

- Added new feature #12345

## \`create-next-app@15.0.0\`

### Patch Changes

- Fixed bug #67890

## Credits

Huge thanks to @foo for helping!`

    expect(writeReleaseNote(changelogs, credits)).toBe(expected)
  })
})
