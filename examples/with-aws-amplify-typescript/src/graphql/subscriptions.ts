// tslint:disable
// this is an auto generated file. This will be overwritten

export const onCreateTodo = `subscription OnCreateTodo {
  onCreateTodo {
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
export const onUpdateTodo = `subscription OnUpdateTodo {
  onUpdateTodo {
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
export const onDeleteTodo = `subscription OnDeleteTodo {
  onDeleteTodo {
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
export const onCreateTodoList = `subscription OnCreateTodoList {
  onCreateTodoList {
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
export const onUpdateTodoList = `subscription OnUpdateTodoList {
  onUpdateTodoList {
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
export const onDeleteTodoList = `subscription OnDeleteTodoList {
  onDeleteTodoList {
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
