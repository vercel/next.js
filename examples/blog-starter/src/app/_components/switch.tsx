import type { Dispatch, SetStateAction } from "react";
import styles from "./switch.module.css";
import type { ColorSchemePreference } from "./theme-switcher";
import cn from "classnames";

export const modes: ColorSchemePreference[] = ["system", "dark", "light"];

export interface SwitchProps {
  mode: ColorSchemePreference;
  setMode: Dispatch<SetStateAction<ColorSchemePreference>>;
}

/**
 * Switch button to quickly toggle user preference.
 */
export const Switch = ({ mode, setMode }: SwitchProps) => {
  /** toggle mode */
  const handleModeSwitch = () => {
    let index = modes.indexOf(mode);
    setMode(modes[(index + 1) % modes.length]);
  };
  return (
    <button
      suppressHydrationWarning
      className={cn(styles.switch, styles[mode])}
      onClick={handleModeSwitch}
    />
  );
};
