// Import react-foundation components
import { MediaObject, MediaObjectSection, Thumbnail } from "react-foundation";

export const Card = () => {
  return (
    <div className="cardlayout">
      <MediaObject>
        <MediaObjectSection>
          <Thumbnail src="https://source.unsplash.com/random/100x100" />
        </MediaObjectSection>
        <MediaObjectSection isMain>
          <h4>Important Heading Here</h4>
          <p>
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Maxime
            mollitia, molestiae quas vel sint commod.
          </p>
        </MediaObjectSection>
      </MediaObject>
    </div>
  );
};
