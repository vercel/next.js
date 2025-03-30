import Image from "next/legacy/image";
import ViewSource from "@/components/view-source";

export default function LayoutResponsive() {
  return (
    <div>
      <ViewSource pathname="app/layout-responsive/page.tsx" />
      <h1>Image Component With Layout Responsive</h1>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="responsive"
        width={700}
        height={475}
      />
    </div>
  );
}
