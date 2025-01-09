import Image from "next/legacy/image";
import ViewSource from "@/components/view-source";

export default function LayoutFill() {
  return (
    <div>
      <ViewSource pathname="app/layout-fill/page.tsx" />
      <h1>Image Component With Layout Fill</h1>
      <div style={{ position: "relative", width: "300px", height: "500px" }}>
        <Image
          alt="Mountains"
          src="/mountains.jpg"
          layout="fill"
          objectFit="cover"
        />
      </div>
      <div style={{ position: "relative", width: "300px", height: "500px" }}>
        <Image
          alt="Mountains"
          src="/mountains.jpg"
          layout="fill"
          objectFit="contain"
        />
      </div>
      <div style={{ position: "relative", width: "300px", height: "500px" }}>
        <Image
          alt="Mountains"
          src="/mountains.jpg"
          layout="fill"
          objectFit="none"
          quality={100}
        />
      </div>
    </div>
  );
}
