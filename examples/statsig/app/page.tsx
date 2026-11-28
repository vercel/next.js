import GateCheck from "@/components/gate-check";
import Logo from "@/components/logo";

export const metadata = {
  title: "Home",
};

export default function Home() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Logo />
      <GateCheck />
    </div>
  );
}
