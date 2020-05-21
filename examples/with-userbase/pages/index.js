import TodoForm from '../components/todo-form'

function Index({ user }) {
  if (user) {
    return (
      <div className="w-4/5 md:w-1/2 mx-auto">
        <h3 className="font-bold text-4xl">
          Welcome, <span className="bg-yellow-400">{user.username}</span>!
        </h3>
        <TodoForm />
      </div>
    )
  } else {
    return null
  }
}

export default Index
