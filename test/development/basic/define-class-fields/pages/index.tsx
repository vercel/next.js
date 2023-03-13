// @ts-ignore
import { makeObservable, observable } from 'mobx'
// @ts-ignore
import { observer } from 'mobx-react'
import React from 'react'

class Person {
  //Declarations are initialized with Object.defineProperty.

  // @ts-ignore
  name: string

  constructor() {
    //without useDefineForClassFields it will be error
    makeObservable(this, {
      name: observable,
    })
  }
}

const person = new Person()

const PersonView = observer(() => {
  const changeName = () => {
    person.name = 'next'
  }
  return (
    <>
      <div id="name">this is my name: {person.name}</div>
      <button id="action" onClick={changeName}>
        Change Name
      </button>
    </>
  )
})

export default function Home() {
  return <PersonView />
}
