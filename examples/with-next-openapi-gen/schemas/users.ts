import { z } from "zod";

export const User = z.object({
  id: z.string().describe("User ID"),
  name: z.string().describe("User name"),
  email: z.string().email().describe("Email address"),
});

export const Users = z.array(User).describe("List of users");

export const CreateUserBody = z.object({
  name: z.string().describe("User name"),
  email: z.string().email().describe("Email address"),
});

export const UpdateUserBody = z.object({
  name: z.string().optional().describe("User name"),
  email: z.string().email().optional().describe("Email address"),
});

export const UsersQuery = z.object({
  limit: z.coerce.number().optional().describe("Number of users to return"),
});

export const UserParams = z.object({
  id: z.string().describe("User ID"),
});
