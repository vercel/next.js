'use client'
// Test both server and client compilation of ECMAScript features.
import { abc } from './export-as'
import json from './file.json' with { type: 'json' }

class ClassWithPrivate {
  #privateField
  #privateFieldWithInitializer = 11

  #privateMethod() {
    this.#privateField = 10
  }

  static #privateStaticFieldWithInitializer = 12

  static #privateStaticMethod() {
    return this.#privateStaticFieldWithInitializer
  }

  constructor() {
    this.#privateMethod()
  }

  getPrivateField() {
    return this.#privateField
  }
  getPrivateFieldWithInitializer() {
    return this.#privateFieldWithInitializer
  }
  getPrivateStaticFieldWithInitializer() {
    return ClassWithPrivate.#privateStaticFieldWithInitializer
  }
  getPrivateStaticMethod() {
    return ClassWithPrivate.#privateStaticMethod()
  }
  isPrivateMethodAvailable() {
    return #privateField in this
  }
}

// Not supported in Node.js yet.
// let regex = /abc/v

export default function Page() {
  const instance = new ClassWithPrivate()

  return (
    <>
      <h1>Ecmascript features test</h1>
      <pre id="values-to-check">
        {JSON.stringify(
          {
            privateField: instance.getPrivateField(),
            privateFieldWithInitializer:
              instance.getPrivateFieldWithInitializer(),
            privateStaticFieldWithInitializer:
              instance.getPrivateStaticFieldWithInitializer(),
            privateStaticMethod: instance.getPrivateStaticMethod(),
            privateMethodInThis: instance.isPrivateMethodAvailable(),
            exportAs: abc,
            importWith: json.message,
            // Not supported in Node.js yet.
            // regex: regex instanceof RegExp
          },
          null,
          2
        )}
      </pre>
    </>
  )
}
