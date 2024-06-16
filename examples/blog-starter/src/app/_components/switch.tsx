import { Dispatch, SetStateAction } from "react";
import styles from "./switch.module.css";
import { ColorSchemePreference, ThemeState } from "./theme-switcher";

export const modes: ColorSchemePreference[] = ["system", "dark", "light"];

export interface SwitchProps {
  themeState: ThemeState;
  setThemeState: Dispatch<SetStateAction<ThemeState>>;
}

/**
 * Switch button to quickly toggle user preference.
 */
export const Switch = ({ themeState, setThemeState }: SwitchProps) => {
  /** toggle mode */
  const handleModeSwitch = () => {
    let index = modes.indexOf(themeState.mode);
    const n = modes.length;
    setThemeState({
      ...themeState,
      mode: modes[(index + 1) % n],
    });
  };
  return <button className={styles.switch} onClick={handleModeSwitch} />;
};
