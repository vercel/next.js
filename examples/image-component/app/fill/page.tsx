import Image from "next/image";
import ViewSource from "../../components/view-source";
import mountains from "../../public/mountains.jpg";

const Fill = () => (
  <div>
    <ViewSource pathname="app/fill/page.tsx" />
    <h1>Image Component With Layout Fill</h1>
    <div style={{ position: "relative", width: "300px", height: "500px" }}>
      <Image
        alt="Mountains"
        src={mountains}
        fill
        sizes="100vw"
        style={{
          objectFit: "cover",
        }}
      />
    </div>
    <div style={{ position: "relative", width: "300px", height: "500px" }}>
      <Image
        alt="Mountains"
        src={mountains}
        fill
        sizes="100vw"
        style={{
          objectFit: "contain",
        }}
      />
    </div>
    <div style={{ position: "relative", width: "300px", height: "500px" }}>
      <Image
        alt="Mountains"
        src={mountains}
        quality={100}
        fill
        sizes="100vw"
        style={{
          objectFit: "none",
        }}
      />
    </div>
  </div>
);

export default Fill;
