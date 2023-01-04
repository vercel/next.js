import React from 'react'

class Base {
  set data(value: number) {
    console.log('data changed to ' + value)
  }

  set name(value: number) {
    console.log('name changed to ' + value)
  }
}

class Derived extends Base {
  // No longer triggers a 'console.log'
  // when using 'useDefineForClassFields'.
  // @ts-ignore
  name = 10
  constructor() {
    super()
    //triggers a 'console.log'
    this.data = 10
  }
}

export default function DerivedView() {
  const obj = new Derived()
  return (
    <>
      <div id={'data'}>{obj.data}</div>
      <div id={'name'}>{obj.name}</div>
    </>
  )
}
