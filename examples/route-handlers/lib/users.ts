export type User = {
  id: string;
  name: string;
};

export const users: User[] = [
  { id: "1", name: "Ada" },
  { id: "2", name: "Grace" },
  { id: "3", name: "Linus" },
];

export function findUser(id: string) {
  return users.find((user) => user.id === id);
}
