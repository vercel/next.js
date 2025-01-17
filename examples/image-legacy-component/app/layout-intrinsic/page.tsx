import Image from "next/legacy/image";
import ViewSource from "@/components/view-source";

export default function LayoutIntrinsic() {
  return (
    <div>
      <ViewSource pathname="app/layout-intrinsic/page.tsx" />
      <h1>Image Component With Layout Intrinsic</h1>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="intrinsic"
        width={700}
        height={475}
      />
    </div>
  );
}
