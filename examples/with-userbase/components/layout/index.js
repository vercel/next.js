import Nav from "../nav";

export default function Layout({ user, setUser, children }) {
  return (
    <div className="container mx-auto">
      <Nav user={user} setUser={setUser} />
      {children}
    </div>
  );
}
