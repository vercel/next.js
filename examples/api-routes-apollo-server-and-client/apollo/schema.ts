import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./type-defs";
import { resolvers } from "./resolvers";

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});
