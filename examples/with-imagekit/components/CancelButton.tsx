import Link from "next/link";
import CancelIcon from "./Icons/CancelIcon";

const CancelButton = () => {
  return (
    <button className="absolute top-4 left-10 rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white">
      <Link href={`/`} shallow>
        <CancelIcon/>
      </Link>
    </button>
  );
};

export default CancelButton;
