import { z } from "zod";
import { CreateUserBody, UpdateUserBody } from "@/schemas/users";

type User = {
  id: string;
  name: string;
  email: string;
};

let users: User[] = [
  { id: "1", name: "John Doe", email: "john@example.com" },
  { id: "2", name: "Jane Smith", email: "jane@example.com" },
];

export const userStore = {
  getAll: (): User[] => [...users],
  getById: (id: string): User | undefined => users.find(u => u.id === id),
  create: (userData: z.infer<typeof CreateUserBody>): User => {
    const newUser: User = { id: Date.now().toString(), ...userData };
    users.push(newUser);
    return newUser;
  },
  update: (id: string, updateData: z.infer<typeof UpdateUserBody>): User | null => {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...updateData };
    return users[index];
  },
  delete: (id: string): User | null => {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    return users.splice(index, 1)[0];
  }
};
