# Auto-Generated Alt Text Feature for Next.js Image Component

## Summary

This PR adds automatic alt text generation for the `next/image` component when the `alt` attribute is not provided. The feature improves accessibility by generating meaningful alt text from image filenames.

## Changes Made

### 1. Created Alt Text Generation Utility

- **File**: `packages/next/src/shared/lib/generate-alt-text.ts`
- **Function**: `generateAltFromSrc(src: string): string`
- **Features**:
  - Converts hyphens and underscores to spaces
  - Capitalizes first letter of each word
  - Handles various URL formats and edge cases
  - Returns empty string for invalid inputs

### 2. Modified Image Props Processing

- **File**: `packages/next/src/shared/lib/get-img-props.ts`
- **Changes**:
  - Made `alt` attribute optional in `ImageProps` type
  - Added auto-generation logic: `const finalAlt = alt ?? generateAltFromSrc(src)`
  - Updated function signature to accept optional `alt`

### 3. Added Comprehensive Tests

- **File**: `packages/next/src/shared/lib/generate-alt-text.test.ts`
- **Coverage**: 15 test cases including edge cases
- **File**: `test/unit/next-image-get-img-props.test.ts`
- **Added**: Tests for auto-generation behavior

## Examples

### Before

```jsx
<Image src="/beautiful-sunset.jpg" width={500} height={300} />
// Error: alt attribute is required
```

### After

```jsx
<Image src="/beautiful-sunset.jpg" width={500} height={300} />
// Automatically generates: alt="Beautiful Sunset"

<Image src="/user-profile-image.png" width={200} height={200} />
// Automatically generates: alt="User Profile Image"
```

### Manual Override

```jsx
<Image
  src="/beautiful-sunset.jpg"
  alt="Custom description"
  width={500}
  height={300}
/>
// Uses provided alt: alt="Custom description"
```

## Implementation Details

### Alt Text Generation Algorithm

1. Extract filename from URL (removing path and query parameters)
2. Remove file extension
3. Split on hyphens and underscores
4. Filter out empty strings
5. Convert to title case (first letter uppercase, rest lowercase)
6. Join with spaces

### Edge Cases Handled

- Empty/null inputs
- URLs with query parameters and fragments
- Filenames with multiple consecutive separators
- Mixed hyphens and underscores
- Numbers in filenames
- Files without extensions

## Backward Compatibility

- **Fully backward compatible**: Existing code with `alt` attributes continues to work unchanged
- **Optional feature**: Only activates when `alt` is not provided
- **Type safety**: Updated TypeScript types to reflect optional nature

## Testing

- **Unit tests**: 15 comprehensive test cases for the utility function
- **Integration tests**: Tests for the image component behavior
- **Edge case coverage**: Handles various URL formats and edge cases

## Performance Impact

- **Minimal overhead**: Simple string operations with O(n) complexity
- **Client-side only**: No server-side processing required
- **Cached results**: Same filename generates same alt text consistently

## Accessibility Benefits

- **Improved compliance**: Helps meet WCAG guidelines for image alt text
- **Better SEO**: Provides meaningful descriptions for search engines
- **Screen reader support**: Ensures all images have descriptive text
- **Developer convenience**: Reduces friction for accessibility compliance

## Future Enhancements

Potential improvements for future versions:

- Configurable alt text generation patterns
- Integration with AI services for more descriptive alt text
- Localization support for non-English filenames
- Custom transformation functions

## Migration Guide

No migration required - this is a purely additive feature. Existing code continues to work as before.
