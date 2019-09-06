export const resolvers = {
  Query: {
    viewer (_parent, _args, _context, _info) {
      return { name: 'John Smith', id: 1 }
    }
  }
}
