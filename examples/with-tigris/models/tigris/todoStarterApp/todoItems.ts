import {
  TigrisCollectionType,
  TigrisDataTypes,
  TigrisSchema,
} from '@tigrisdata/core/dist/types'

export const COLLECTION_NAME = 'todoItems'

export interface TodoItem extends TigrisCollectionType {
  id?: number
  text: string
  completed: boolean
}

export const TodoItemSchema: TigrisSchema<TodoItem> = {
  id: {
    type: TigrisDataTypes.INT32,
    primary_key: { order: 1, autoGenerate: true },
  },
  text: { type: TigrisDataTypes.STRING },
  completed: { type: TigrisDataTypes.BOOLEAN },
}
