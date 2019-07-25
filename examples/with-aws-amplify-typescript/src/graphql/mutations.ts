// tslint:disable
// this is an auto generated file. This will be overwritten

export const createTodo = `mutation CreateTodo($input: CreateTodoInput!) {
  createTodo(input: $input) {
    id
    name
    createdAt
    completed
    todoList {
      id
      createdAt
      todos {
        nextToken
      }
    }
    userId
  }
}
`;
export const updateTodo = `mutation UpdateTodo($input: UpdateTodoInput!) {
  updateTodo(input: $input) {
    id
    name
    createdAt
    completed
    todoList {
      id
      createdAt
      todos {
        nextToken
      }
    }
    userId
  }
}
`;
export const deleteTodo = `mutation DeleteTodo($input: DeleteTodoInput!) {
  deleteTodo(input: $input) {
    id
    name
    createdAt
    completed
    todoList {
      id
      createdAt
      todos {
        nextToken
      }
    }
    userId
  }
}
`;
export const createTodoList = `mutation CreateTodoList($input: CreateTodoListInput!) {
  createTodoList(input: $input) {
    id
    createdAt
    todos {
      items {
        id
        name
        createdAt
        completed
        userId
      }
      nextToken
    }
  }
}
`;
export const updateTodoList = `mutation UpdateTodoList($input: UpdateTodoListInput!) {
  updateTodoList(input: $input) {
    id
    createdAt
    todos {
      items {
        id
        name
        createdAt
        completed
        userId
      }
      nextToken
    }
  }
}
`;
export const deleteTodoList = `mutation DeleteTodoList($input: DeleteTodoListInput!) {
  deleteTodoList(input: $input) {
    id
    createdAt
    todos {
      items {
        id
        name
        createdAt
        completed
        userId
      }
      nextToken
    }
  }
}
`;
