// eslint-disable
// this is an auto generated file. This will be overwritten

export const fetchTodo = `query FetchTodo($id: ID) {
  fetchTodo(id: $id) {
    id
    name
    createdAt
    completed
  }
}
`;
export const getTodo = `query GetTodo($id: ID!) {
  getTodo(id: $id) {
    id
    name
    createdAt
    completed
  }
}
`;
export const listTodos = `query ListTodos(
  $filter: ModelTodoFilterInput
  $limit: Int
  $nextToken: String
) {
  listTodos(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      name
      createdAt
      completed
    }
    nextToken
  }
}
`;
