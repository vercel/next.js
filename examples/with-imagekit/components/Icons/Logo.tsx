"use client";
import { IKImage } from "imagekitio-next";

const Logo = () => {
  return (
    <div className="flex gap-1.5 items-center">
    <div className="relative h-8 w-8">
      <IKImage
        urlEndpoint="https://ikmedia.imagekit.io/"
        alt="ImageKit logo"
        src="https://ikmedia.imagekit.io/logo/light-icon_GTyhLlWNX-.svg?updatedAt=1610958435591"
        fill={true}
        className="rounded-md"
      />
    </div>
    <div className="relative h-4 w-20 mt-1">
      <IKImage
        urlEndpoint="https://ikmedia.imagekit.io/"
        alt="ImageKit logo"
        src="https://ikmedia.imagekit.io/logo/ikLogoWhite_30FbZCVusC.svg?updatedAt=1631077405708"
        fill={true}
      />
    </div>
  </div>
  );
};

export default Logo;
