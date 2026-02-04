function toFixed(value, maxDecimals, roundingFunction, optionals) {
  var splitValue = value.toString().split('.'),
    minDecimals = maxDecimals - (optionals || 0),
    optionalsRegExp,
    power,
    output
  var boundedPrecisions
  // var unused = 'xxxx';
  // Use the smallest precision value possible to avoid errors from floating point representation
  if (splitValue.length === 2) {
    boundedPrecisions = Math.min(
      Math.max(splitValue[1].length, minDecimals),
      maxDecimals
    )
  } else {
    boundedPrecisions = minDecimals
  }
  power = Math.pow(10, boundedPrecisions)
  // Multiply up by precision, round accurately, then divide and use native toFixed():
  output = (roundingFunction(value + 'e+' + boundedPrecisions) / power).toFixed(
    boundedPrecisions
  )
  if (optionals > maxDecimals - boundedPrecisions) {
    optionalsRegExp = new RegExp(
      '\\.?0{1,' + (optionals - (maxDecimals - boundedPrecisions)) + '}$'
    )
    output = output.replace(optionalsRegExp, '')
  }
  return output
}

it('should work', () => {
  expect(toFixed(1.2345, 2, Math.round, 1)).toBe('1.23')
})
