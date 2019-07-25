/* tslint:disable */
//  This file was automatically generated and should not be edited.

export type CreateTodoInput = {
  id?: string | null,
  name: string,
  createdAt: string,
  completed: boolean,
  userId: string,
  todoTodoListId: string,
};

export type UpdateTodoInput = {
  id: string,
  name?: string | null,
  createdAt?: string | null,
  completed?: boolean | null,
  userId?: string | null,
  todoTodoListId?: string | null,
};

export type DeleteTodoInput = {
  id?: string | null,
};

export type CreateTodoListInput = {
  id?: string | null,
  createdAt: string,
};

export type UpdateTodoListInput = {
  id: string,
  createdAt?: string | null,
};

export type DeleteTodoListInput = {
  id?: string | null,
};

export type ModelTodoFilterInput = {
  id?: ModelIDFilterInput | null,
  name?: ModelStringFilterInput | null,
  createdAt?: ModelStringFilterInput | null,
  completed?: ModelBooleanFilterInput | null,
  userId?: ModelStringFilterInput | null,
  and?: Array< ModelTodoFilterInput | null > | null,
  or?: Array< ModelTodoFilterInput | null > | null,
  not?: ModelTodoFilterInput | null,
};

export type ModelIDFilterInput = {
  ne?: string | null,
  eq?: string | null,
  le?: string | null,
  lt?: string | null,
  ge?: string | null,
  gt?: string | null,
  contains?: string | null,
  notContains?: string | null,
  between?: Array< string | null > | null,
  beginsWith?: string | null,
};

export type ModelStringFilterInput = {
  ne?: string | null,
  eq?: string | null,
  le?: string | null,
  lt?: string | null,
  ge?: string | null,
  gt?: string | null,
  contains?: string | null,
  notContains?: string | null,
  between?: Array< string | null > | null,
  beginsWith?: string | null,
};

export type ModelBooleanFilterInput = {
  ne?: boolean | null,
  eq?: boolean | null,
};

export type ModelTodoListFilterInput = {
  id?: ModelIDFilterInput | null,
  createdAt?: ModelStringFilterInput | null,
  and?: Array< ModelTodoListFilterInput | null > | null,
  or?: Array< ModelTodoListFilterInput | null > | null,
  not?: ModelTodoListFilterInput | null,
};

export type CreateTodoMutationVariables = {
  input: CreateTodoInput,
};

export type CreateTodoMutation = {
  createTodo:  {
    __typename: "Todo",
    id: string,
    name: string,
    createdAt: string,
    completed: boolean,
    todoList:  {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    },
    userId: string,
  } | null,
};

export type UpdateTodoMutationVariables = {
  input: UpdateTodoInput,
};

export type UpdateTodoMutation = {
  updateTodo:  {
    __typename: "Todo",
    id: string,
    name: string,
    createdAt: string,
    completed: boolean,
    todoList:  {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    },
    userId: string,
  } | null,
};

export type DeleteTodoMutationVariables = {
  input: DeleteTodoInput,
};

export type DeleteTodoMutation = {
  deleteTodo:  {
    __typename: "Todo",
    id: string,
    name: string,
    createdAt: string,
    completed: boolean,
    todoList:  {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    },
    userId: string,
  } | null,
};

export type CreateTodoListMutationVariables = {
  input: CreateTodoListInput,
};

export type CreateTodoListMutation = {
  createTodoList:  {
    __typename: "TodoList",
    id: string,
    createdAt: string,
    todos:  {
      __typename: "ModelTodoConnection",
      items:  Array< {
        __typename: "Todo",
        id: string,
        name: string,
        createdAt: string,
        completed: boolean,
        userId: string,
      } | null > | null,
      nextToken: string | null,
    } | null,
  } | null,
};

export type UpdateTodoListMutationVariables = {
  input: UpdateTodoListInput,
};

export type UpdateTodoListMutation = {
  updateTodoList:  {
    __typename: "TodoList",
    id: string,
    createdAt: string,
    todos:  {
      __typename: "ModelTodoConnection",
      items:  Array< {
        __typename: "Todo",
        id: string,
        name: string,
        createdAt: string,
        completed: boolean,
        userId: string,
      } | null > | null,
      nextToken: string | null,
    } | null,
  } | null,
};

export type DeleteTodoListMutationVariables = {
  input: DeleteTodoListInput,
};

export type DeleteTodoListMutation = {
  deleteTodoList:  {
    __typename: "TodoList",
    id: string,
    createdAt: string,
    todos:  {
      __typename: "ModelTodoConnection",
      items:  Array< {
        __typename: "Todo",
        id: string,
        name: string,
        createdAt: string,
        completed: boolean,
        userId: string,
      } | null > | null,
      nextToken: string | null,
    } | null,
  } | null,
};

export type GetTodoQueryVariables = {
  id: string,
};

export type GetTodoQuery = {
  getTodo:  {
    __typename: "Todo",
    id: string,
    name: string,
    createdAt: string,
    completed: boolean,
    todoList:  {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    },
    userId: string,
  } | null,
};

export type ListTodosQueryVariables = {
  filter?: ModelTodoFilterInput | null,
  limit?: number | null,
  nextToken?: string | null,
};

export type ListTodosQuery = {
  listTodos:  {
    __typename: "ModelTodoConnection",
    items:  Array< {
      __typename: "Todo",
      id: string,
      name: string,
      createdAt: string,
      completed: boolean,
      todoList:  {
        __typename: "TodoList",
        id: string,
        createdAt: string,
      },
      userId: string,
    } | null > | null,
    nextToken: string | null,
  } | null,
};

export type GetTodoListQueryVariables = {
  id: string,
};

export type GetTodoListQuery = {
  getTodoList:  {
    __typename: "TodoList",
    id: string,
    createdAt: string,
    todos:  {
      __typename: "ModelTodoConnection",
      items:  Array< {
        __typename: "Todo",
        id: string,
        name: string,
        createdAt: string,
        completed: boolean,
        userId: string,
      } | null > | null,
      nextToken: string | null,
    } | null,
  } | null,
};

export type ListTodoListsQueryVariables = {
  filter?: ModelTodoListFilterInput | null,
  limit?: number | null,
  nextToken?: string | null,
};

export type ListTodoListsQuery = {
  listTodoLists:  {
    __typename: "ModelTodoListConnection",
    items:  Array< {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    } | null > | null,
    nextToken: string | null,
  } | null,
};

export type OnCreateTodoSubscription = {
  onCreateTodo:  {
    __typename: "Todo",
    id: string,
    name: string,
    createdAt: string,
    completed: boolean,
    todoList:  {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    },
    userId: string,
  } | null,
};

export type OnUpdateTodoSubscription = {
  onUpdateTodo:  {
    __typename: "Todo",
    id: string,
    name: string,
    createdAt: string,
    completed: boolean,
    todoList:  {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    },
    userId: string,
  } | null,
};

export type OnDeleteTodoSubscription = {
  onDeleteTodo:  {
    __typename: "Todo",
    id: string,
    name: string,
    createdAt: string,
    completed: boolean,
    todoList:  {
      __typename: "TodoList",
      id: string,
      createdAt: string,
      todos:  {
        __typename: "ModelTodoConnection",
        nextToken: string | null,
      } | null,
    },
    userId: string,
  } | null,
};

export type OnCreateTodoListSubscription = {
  onCreateTodoList:  {
    __typename: "TodoList",
    id: string,
    createdAt: string,
    todos:  {
      __typename: "ModelTodoConnection",
      items:  Array< {
        __typename: "Todo",
        id: string,
        name: string,
        createdAt: string,
        completed: boolean,
        userId: string,
      } | null > | null,
      nextToken: string | null,
    } | null,
  } | null,
};

export type OnUpdateTodoListSubscription = {
  onUpdateTodoList:  {
    __typename: "TodoList",
    id: string,
    createdAt: string,
    todos:  {
      __typename: "ModelTodoConnection",
      items:  Array< {
        __typename: "Todo",
        id: string,
        name: string,
        createdAt: string,
        completed: boolean,
        userId: string,
      } | null > | null,
      nextToken: string | null,
    } | null,
  } | null,
};

export type OnDeleteTodoListSubscription = {
  onDeleteTodoList:  {
    __typename: "TodoList",
    id: string,
    createdAt: string,
    todos:  {
      __typename: "ModelTodoConnection",
      items:  Array< {
        __typename: "Todo",
        id: string,
        name: string,
        createdAt: string,
        completed: boolean,
        userId: string,
      } | null > | null,
      nextToken: string | null,
    } | null,
  } | null,
};
