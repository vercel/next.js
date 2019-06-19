import React from "react";
import { Heart, ShareButton } from "../images/icons";
export const Card = props => {
  // what would you need as props?
  //props.product/
  // product consists of {
  // title:
  // subtitle:
  // model:
  // id:
  // imageSrc: "https://c.static-nike.com/a/images/w_960,c_limit,f_auto/df2swtryoc6ybqr6bb9t/air-jordan-xiv-supreme-release-date.jpg"
  // bio:
  // price:
  // releast date
  // secondondary images
  // tags: object type
  //}
  return (
    <div className="card">
      <div className="card__image">image</div>
      <div className="card__title-container">
        <div className="card__product-title">title</div>
        <div className="card__product-subtitle">subtitle</div>
      </div>
      <div className="card__action-bar">
        <button className="card__notification-btn button button--transparent">
          Notify Me
        </button>
        <ShareButton />
        <Heart />
      </div>
    </div>
  );
};
