/*
MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const preserveCamelCase = (string: string, locale: string) => {
  let isLastCharLower = false
  let isLastCharUpper = false
  let isLastLastCharUpper = false

  for (let i = 0; i < string.length; i++) {
    const character = string[i]

    if (isLastCharLower && /[\p{Lu}]/u.test(character)) {
      string = string.slice(0, i) + '-' + string.slice(i)
      isLastCharLower = false
      isLastLastCharUpper = isLastCharUpper
      isLastCharUpper = true
      i++
    } else if (
      isLastCharUpper &&
      isLastLastCharUpper &&
      /[\p{Ll}]/u.test(character)
    ) {
      string = string.slice(0, i - 1) + '-' + string.slice(i - 1)
      isLastLastCharUpper = isLastCharUpper
      isLastCharUpper = false
      isLastCharLower = true
    } else {
      isLastCharLower =
        character.toLocaleLowerCase(locale) === character &&
        character.toLocaleUpperCase(locale) !== character
      isLastLastCharUpper = isLastCharUpper
      isLastCharUpper =
        character.toLocaleUpperCase(locale) === character &&
        character.toLocaleLowerCase(locale) !== character
    }
  }

  return string
}

const preserveConsecutiveUppercase = (input: string) => {
  return input.replace(/^[\p{Lu}](?![\p{Lu}])/gu, (m1) => m1.toLowerCase())
}

const postProcess = (input: string, options: { locale: string }) => {
  return input
    .replace(/[_.\- ]+([\p{Alpha}\p{N}_]|$)/gu, (_, p1) =>
      p1.toLocaleUpperCase(options.locale)
    )
    .replace(/\d+([\p{Alpha}\p{N}_]|$)/gu, (m) =>
      m.toLocaleUpperCase(options.locale)
    )
}

const camelCase = (input: string | string[], options?: any) => {
  if (!(typeof input === 'string' || Array.isArray(input))) {
    throw new TypeError('Expected the input to be `string | string[]`')
  }

  options = {
    pascalCase: false,
    preserveConsecutiveUppercase: false,
    ...options,
  }

  if (Array.isArray(input)) {
    input = input
      .map((x) => x.trim())
      .filter((x) => x.length)
      .join('-')
  } else {
    input = input.trim()
  }

  if (input.length === 0) {
    return ''
  }

  if (input.length === 1) {
    return options.pascalCase
      ? input.toLocaleUpperCase(options.locale)
      : input.toLocaleLowerCase(options.locale)
  }

  const hasUpperCase = input !== input.toLocaleLowerCase(options.locale)

  if (hasUpperCase) {
    input = preserveCamelCase(input, options.locale)
  }

  input = input.replace(/^[_.\- ]+/, '')

  if (options.preserveConsecutiveUppercase) {
    input = preserveConsecutiveUppercase(input)
  } else {
    input = input.toLocaleLowerCase()
  }

  if (options.pascalCase) {
    input = input.charAt(0).toLocaleUpperCase(options.locale) + input.slice(1)
  }

  return postProcess(input, options)
}

export default camelCase
