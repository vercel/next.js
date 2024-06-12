import Link from "next/link";
import { Switch } from "nextjs-darkmode/switch";

const Header = () => {
  return (
    <h2 className="text-2xl md:text-4xl font-bold tracking-tight md:tracking-tighter leading-tight mb-20 mt-8 flex justify-between items-center">
      <Link href="/" className="hover:underline">
        Blog.
      </Link>
      <Switch size={28} />
    </h2>
  );
};

export default Header;
