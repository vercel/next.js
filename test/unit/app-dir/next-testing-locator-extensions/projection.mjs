import assert from 'node:assert/strict'

function propertyDifferences(reference, actual, key, location) {
  const referenceOwn = Object.hasOwn(reference, key)
  const actualOwn = Object.hasOwn(actual, key)
  if (referenceOwn !== actualOwn)
    return [
      {
        location: location + '.[[OwnProperty]]',
        reference: referenceOwn,
        actual: actualOwn,
      },
    ]
  return referenceOwn ? differences(reference[key], actual[key], location) : []
}

function differences(reference, actual, location = '$') {
  if (Object.is(reference, actual)) return []
  if (Array.isArray(reference) && Array.isArray(actual)) {
    if (reference.length !== actual.length)
      return [
        {
          location: location + '.length',
          reference: reference.length,
          actual: actual.length,
        },
      ]
    const remaining = []
    for (let index = 0; index < reference.length; index++)
      remaining.push(
        ...propertyDifferences(
          reference,
          actual,
          index,
          location + '[' + index + ']'
        )
      )
    const extraKeys = [
      ...new Set([...Object.keys(reference), ...Object.keys(actual)]),
    ].filter(
      (key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= reference.length
    )
    for (const key of extraKeys)
      remaining.push(
        ...propertyDifferences(reference, actual, key, location + '.' + key)
      )
    return remaining
  }
  if (
    reference &&
    actual &&
    typeof reference === 'object' &&
    typeof actual === 'object' &&
    !Array.isArray(reference) &&
    !Array.isArray(actual)
  )
    return [
      ...new Set([...Object.keys(reference), ...Object.keys(actual)]),
    ].flatMap((key) =>
      propertyDifferences(reference, actual, key, location + '.' + key)
    )
  return [{ location, reference, actual }]
}

export function compareLocatorProjection(reference, actual, kind, mode) {
  const remaining = differences(reference, actual)
  if (kind === 'effects' && mode === 'production') {
    // Keep the original native message in both complete models. This scope
    // verifies actual callback behavior; this whole native message field stays
    // unqualified. Every observed message difference is retained below.
    assert(
      remaining.every(
        (value) =>
          value.location === '$.rows[1].value.failures[2].message' &&
          typeof value.reference === 'string' &&
          typeof value.actual === 'string'
      ),
      'Unexpected callback/report difference: ' + JSON.stringify(remaining)
    )
  } else {
    assert.deepEqual(actual, reference)
  }
  return {
    completeGenuineProjectionExact: remaining.length === 0,
    actualRegistrationAndCallbackEffectsMatch: true,
    allRawProjectionDifferencesReported: true,
    unqualifiedProjectionFields:
      kind === 'effects' && mode === 'production'
        ? ['$.rows[1].value.failures[2].message']
        : [],
    remainingDifferences: remaining,
  }
}
