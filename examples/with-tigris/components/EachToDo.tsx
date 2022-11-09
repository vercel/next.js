import Image from 'next/image'
import React from 'react'
import { TodoItem } from '../models/tigris/todoStarterApp/todoItems'
import styles from '../styles/EachToDo.module.css'

type Props = {
  toDoItem: TodoItem
  deleteHandler: (id?: number) => void
  updateHandler: (item: TodoItem) => void
}
const EachTodo = ({ toDoItem, deleteHandler, updateHandler }: Props) => {
  return (
    <>
      <li className={styles.each}>
        <button
          className={styles.eachButton}
          onClick={() => {
            updateHandler(toDoItem)
          }}
        >
          <Image
            src={toDoItem.completed ? '/circle-checked.svg' : '/circle.svg'}
            layout="fixed"
            width={20}
            height={20}
            alt="Check Image"
          />
          <span
            style={toDoItem.completed ? { textDecoration: 'line-through' } : {}}
          >
            {toDoItem.text}
          </span>
        </button>
        <button
          className={styles.deleteBtn}
          onClick={() => {
            deleteHandler(toDoItem.id)
          }}
        >
          <Image src="/delete.svg" width={24} height={24} alt="Check Image" />
        </button>
      </li>
    </>
  )
}

export default EachTodo
