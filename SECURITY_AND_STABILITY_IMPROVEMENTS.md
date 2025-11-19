# Next.js Security and Stability Improvements

## Overview
This document outlines critical security, stability, and performance improvements made to the Next.js codebase.

## Summary of Changes

### 1. Type Safety Improvements

#### a. Constants Module (packages/next/src/shared/lib/constants.ts)
- **Issue**: Unsafe `as any` type cast in CONFIG_FILES array
- **Fix**: Removed type cast and added proper type checking for process.features.typescript
- **Impact**: Prevents potential runtime errors from undefined process features

#### b. Configuration Module (packages/next/src/server/config.ts)
- **Issue**: Unsafe type assertion without runtime validation
- **Fix**: Added explicit hasTypescriptSupport type guard with proper boolean checking
- **Impact**: Ensures type safety during configuration loading

### 2. Runtime Validation Framework

#### New Module: packages/next/src/lib/runtime-validation.ts
Created comprehensive validation utilities with the following features:

- **ValidationError Class**: Custom error type for validation failures
- **Type Guards**: isObject, isString, isNumber, isBoolean, isArray
- **JSON Validation**: Safe JSON parsing with type checking
- **URL Validation**: Protocol and format validation
- **Header Validation**: HTTP header format and size validation
- **String Sanitization**: XSS protection and length limiting
- **Body Size Validation**: Configurable request body size limits
- **Batch Validation**: Efficient multi-field validation with error aggregation
- **Environment Variable Validation**: Secure env var access with type checking

### 3. API Security Enhancements

#### a. Preview Data Validation (packages/next/src/server/api-utils/node/api-resolver.ts)
- **Issue**: Preview data passed to encryption without validation
- **Fix**: Added isValidPreviewData type guard checking for object type and key presence
- **Impact**: Prevents invalid data from reaching encryption layer

#### b. Preview Data Parsing (packages/next/src/server/api-utils/node/try-get-preview-data.ts)
- **Issue**: JSON.parse result not validated after decryption
- **Fix**: Added null check and type validation after JSON parsing, dev mode warnings
- **Impact**: Prevents runtime errors from malformed preview data

### 4. Action Handler Security

#### Module: packages/next/src/server/app-render/action-handler.ts

**a. Body Size Limit Enforcement**
- **Issue**: No protection against large request bodies
- **Fix**: 
  - Default 1MB limit (configurable via MAX_ACTION_BODY_SIZE env var)
  - TextEncoder-based byte counting for accurate size validation
  - 413 Payload Too Large status code for oversized requests
- **Impact**: Prevents DoS attacks via large payloads

**b. Error Status Code Mapping**
- **Issue**: All errors returned generic 500 status
- **Fix**: Status code mapping:
  - ValidationError: 400 Bad Request
  - UnauthorizedError: 401 Unauthorized
  - ForbiddenError: 403 Forbidden
  - ApiError: Respects custom status code
  - Default: 500 Internal Server Error
- **Impact**: Better HTTP semantics and client error handling

### 5. Concurrency and Race Condition Fixes

#### Base Server (packages/next/src/server/base-server.ts)
- **Issue**: Global incrementalCache shared across requests causing race conditions
- **Fix**: Changed to request-scoped property with getter, ensures each request gets dedicated cache instance
- **Impact**: Eliminates cache corruption and race conditions in concurrent requests

### 6. Input Validation and Sanitization

#### a. Middleware JSON Parsing (packages/next/src/server/dev/middleware-turbopack.ts)
- **Issue**: JSON.parse without error handling or validation
- **Fix**: 
  - Try-catch wrapper around JSON parsing
  - Type and structure validation for request object
  - Array validation for frames field
  - 400 Bad Request response for invalid input
- **Impact**: Prevents server crashes from malformed JSON

#### b. HMR WebSocket Validation (packages/next/src/server/dev/hot-reloader-webpack.ts)
- **Issue**: WebSocket message payload not validated
- **Fix**: Added validation for payload object structure and event field presence
- **Impact**: Prevents crashes from malformed HMR messages

#### c. Debug Info Array Access (packages/next/src/server/dev/hot-reloader-turbopack.ts)
- **Issue**: Unsafe array[0] access without length check
- **Fix**: Added Array.isArray check and length validation before accessing first element
- **Impact**: Prevents TypeError when debug info is empty or not an array

### 7. Prototype Pollution Protection

#### Render Result Module (packages/next/src/server/render-result.ts)
- **Issue**: Object.assign without key filtering allows prototype pollution
- **Fix**: 
  - Manual property assignment with hasOwnProperty check
  - Explicit filtering of __proto__, constructor, and prototype keys
- **Impact**: Prevents prototype pollution attacks via metadata assignment

## Security Best Practices Implemented

1. **Defense in Depth**: Multiple validation layers (type guards, size limits, format checks)
2. **Fail-Safe Defaults**: Conservative defaults (1MB body limit, strict type checking)
3. **Explicit Error Handling**: Proper HTTP status codes and error messages
4. **Input Sanitization**: All external input validated before processing
5. **Race Condition Prevention**: Request-scoped resources instead of globals
6. **Type Safety**: Runtime validation complementing TypeScript compile-time checks

## Performance Optimizations

1. **Efficient Validation**: Early exit on validation failure
2. **Batch Processing**: Aggregate validation reduces overhead
3. **Cached Type Guards**: Reusable validation functions
4. **Request-Scoped Resources**: Eliminates locking and contention

## Testing Recommendations

1. Test body size limits with various payload sizes
2. Verify error status codes for different error types
3. Test concurrent requests for cache isolation
4. Validate JSON parsing error handling with malformed input
5. Test prototype pollution prevention with malicious metadata
6. Verify preview data validation with invalid inputs

## Migration Notes

- Environment variable `MAX_ACTION_BODY_SIZE` can be set to customize body size limit (bytes)
- New ValidationError class can be used throughout codebase for consistent error handling
- Runtime validation utilities are available for use in any server module

## Files Modified

1. `packages/next/src/shared/lib/constants.ts` - Type safety fix
2. `packages/next/src/server/config.ts` - Type guard implementation
3. `packages/next/src/server/api-utils/node/api-resolver.ts` - Preview data validation
4. `packages/next/src/server/api-utils/node/try-get-preview-data.ts` - JSON parsing safety
5. `packages/next/src/server/app-render/action-handler.ts` - Body limits and status codes
6. `packages/next/src/server/base-server.ts` - Cache concurrency fix
7. `packages/next/src/lib/runtime-validation.ts` - New validation framework (CREATED)
8. `packages/next/src/server/dev/middleware-turbopack.ts` - JSON validation
9. `packages/next/src/server/dev/hot-reloader-webpack.ts` - HMR payload validation
10. `packages/next/src/server/dev/hot-reloader-turbopack.ts` - Array access safety
11. `packages/next/src/server/render-result.ts` - Prototype pollution protection

## Compliance and Standards

- OWASP Top 10 2021 compliance improvements
- CWE-1321: Prototype Pollution prevention
- CWE-400: Resource exhaustion prevention (body size limits)
- CWE-362: Race condition mitigation
- CWE-20: Input validation
- CWE-754: Improper check for unusual conditions

## Future Improvements

1. Integrate runtime validation into more API endpoints
2. Add request rate limiting
3. Implement comprehensive audit logging
4. Add security headers middleware
5. Enhance CSRF protection
6. Add input fuzzing tests
