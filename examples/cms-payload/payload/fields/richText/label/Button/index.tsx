"use client";

/* eslint-disable import/no-extraneous-dependencies */
// eslint-disable-next-line no-use-before-define
import React from "react";
import { ElementButton } from "payload/components/rich-text";
import Icon from "../Icon";

const baseClass = "rich-text-label-button";

const ToolbarButton: React.FC<{ path: string }> = () => (
  <ElementButton className={baseClass} format="label">
    <Icon />
  </ElementButton>
);

export default ToolbarButton;
