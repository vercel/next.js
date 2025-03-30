import Image from "next/legacy/image";
import ViewSource from "@/components/view-source";

export default function LayoutFixed() {
  return (
    <div>
      <ViewSource pathname="app/layout-fixed/page.tsx" />
      <h1>Image Component With Layout Fixed</h1>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fixed"
        width={700}
        height={475}
      />
    </div>
  );
}
