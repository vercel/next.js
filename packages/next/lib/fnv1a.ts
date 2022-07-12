// MIT License
//
// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the Software
// is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const OFFSET_BASIS_32 = 2166136261

function fnv1aString(str: string) {
  let hash = OFFSET_BASIS_32

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    // 32-bit FNV prime: 2**24 + 2**8 + 0x93 = 16777619
    // Using bitshift for accuracy and performance. Numbers in JS suck.
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return hash >>> 0
}

function fnv1aBuffer(buf: Buffer) {
  let hash = OFFSET_BASIS_32

  for (let i = 0; i < buf.length; ) {
    hash ^= buf[i++]

    // 32-bit FNV prime: 2**24 + 2**8 + 0x93 = 16777619
    // Using bitshift for accuracy and performance. Numbers in JS suck.
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }

  return hash >>> 0
}

export function fnv1a(input: string | Buffer): number {
  if (input instanceof Buffer) {
    return fnv1aBuffer(input)
  } else if (typeof input === 'string') {
    return fnv1aString(input)
  } else {
    throw new Error('input must be a string or a Buffer')
  }
}
