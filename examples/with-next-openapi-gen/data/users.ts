let users = [
  { id: "1", name: "John Doe", email: "john@example.com" },
  { id: "2", name: "Jane Smith", email: "jane@example.com" },
];

export const userStore = {
  getAll: () => [...users],
  getById: (id: string) => users.find(u => u.id === id),
  create: (userData: { name: string; email: string }) => {
    const newUser = { id: Date.now().toString(), ...userData };
    users.push(newUser);
    return newUser;
  },
  update: (id: string, updateData: Partial<{ name: string; email: string }>) => {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...updateData };
    return users[index];
  },
  delete: (id: string) => {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    return users.splice(index, 1)[0];
  }
};
