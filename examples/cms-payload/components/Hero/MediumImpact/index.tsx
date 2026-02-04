import { Cell, Grid } from "@faceless-ui/css-grid";
import React from "react";
import { Page } from "../../../payload-types";
import { Gutter } from "../../Gutter";
import { CMSLink } from "../../Link";
import { Media } from "../../Media";
import RichText from "../../RichText";

import classes from "./index.module.scss";

export const MediumImpactHero: React.FC<Page["hero"]> = (props) => {
  const { richText, media, links } = props;

  return (
    <Gutter className={classes.hero}>
      <Grid>
        <Cell cols={5} colsM={4}>
          <RichText className={classes.richText} content={richText} />
          {Array.isArray(links) && (
            <ul className={classes.links}>
              {links.map(({ link }, i) => {
                return (
                  <li key={i}>
                    <CMSLink className={classes.link} {...link} />
                  </li>
                );
              })}
            </ul>
          )}
        </Cell>
        <Cell cols={7} colsM={4}>
          {typeof media === "object" && (
            <Media className={classes.media} resource={media} />
          )}
        </Cell>
      </Grid>
    </Gutter>
  );
};
