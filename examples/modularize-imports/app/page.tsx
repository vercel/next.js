import LeftHalf from "./_components/halves/LeftHalf";
import RightHalf from "./_components/halves/RightHalf";
import { HeadingLarge } from "./_components/ui/heading-large";

export default function Index() {
  return (
    <HeadingLarge>
      <LeftHalf />
      <RightHalf />
    </HeadingLarge>
  );
}
