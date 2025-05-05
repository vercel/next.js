import { getChangelogByVersion } from './get-changelog-by-version'

const CHANGELOG_MD = `# next

## 1.0.1

### Patch Changes

- lorem ipsum #12345

## 1.0.0

### Major Changes

- lorem ipsum #12345

### Minor Changes

- lorem ipsum #12345

### Patch Changes

- lorem ipsum #12345

## 0.1.1

### Patch Changes

- lorem ipsum #12345
- lorem ipsum #12345

`

describe('getChangelogByVersion', () => {
  it('should extract changelog section for a specific version', () => {
    expect(getChangelogByVersion(CHANGELOG_MD, '1.0.0')).toMatchInlineSnapshot(`
     "### Major Changes

     - lorem ipsum #12345

     ### Minor Changes

     - lorem ipsum #12345

     ### Patch Changes

     - lorem ipsum #12345"
    `)

    expect(getChangelogByVersion(CHANGELOG_MD, '1.0.1')).toMatchInlineSnapshot(`
     "### Patch Changes

     - lorem ipsum #12345"
    `)
  })

  it('should return empty string when version not found', () => {
    expect(getChangelogByVersion(CHANGELOG_MD, '0.0.0')).toBe('')
  })
})
