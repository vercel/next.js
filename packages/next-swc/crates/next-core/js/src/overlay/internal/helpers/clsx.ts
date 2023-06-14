/*
MIT License

Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// This file is based on https://github.com/lukeed/clsx/blob/v1.2.1/src/index.js
// It's been edited for the needs of this project
// See the LICENSE at the top of the file

export type TruthyClassValue =
  | ClassArray
  | ClassDictionary
  | string
  | number
  | boolean
export type ClassValue = TruthyClassValue | null | undefined
export type ClassDictionary = Record<string, any>
export type ClassArray = ClassValue[]

function toVal(mix: TruthyClassValue) {
  let k,
    y,
    str = ''

  if (typeof mix === 'string' || typeof mix === 'number') {
    str += mix
  } else if (typeof mix === 'object') {
    if (Array.isArray(mix)) {
      for (k = 0; k < mix.length; k++) {
        if (mix[k]) {
          if ((y = toVal(mix[k]))) {
            str && (str += ' ')
            str += y
          }
        }
      }
    } else {
      for (k in mix) {
        if (mix[k]) {
          str && (str += ' ')
          str += k
        }
      }
    }
  }

  return str
}

export function clsx(...inputs: ClassValue[]) {
  let i = 0,
    tmp,
    x,
    str = ''
  while (i < inputs.length) {
    if ((tmp = inputs[i++])) {
      if ((x = toVal(tmp))) {
        str && (str += ' ')
        str += x
      }
    }
  }
  return str
}
