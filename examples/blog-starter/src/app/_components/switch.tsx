import { Dispatch, HTMLProps, SetStateAction } from "react";
import styles from "./switch.module.css";
import { ColorSchemePreference, ThemeState } from "./theme-switcher";

export const modes: ColorSchemePreference[] = ["system", "dark", "light"];

export interface SwitchProps extends HTMLProps<HTMLButtonElement> {
  /** html tag @defaultValue 'button' */
  tag?: "button" | "div";
  /** Diameter of the color switch */
  size?: number;
  /** Skip system colorScheme while toggling */
  skipSystem?: boolean;
  themeState: ThemeState;
  setThemeState: Dispatch<SetStateAction<ThemeState>>;
}

/**
 * Switch button to quickly toggle user preference.
 *
 * @example
 * ```tsx
 * <Switch [size={20} skipSystem]/>
 * ```
 *
 * @source - Source code
 */
export const Switch = ({
  tag: Tag = "button",
  size = 24,
  skipSystem,
  children,
  themeState: state,
  setThemeState: setState,
  ...props
}: SwitchProps) => {
  /** toggle mode */
  const handleModeSwitch = () => {
    let index = modes.indexOf(state.mode);
    const n = modes.length;
    if (skipSystem && index === n - 1) index = 0;
    setState({
      ...state,
      mode: modes[(index + 1) % n],
    });
  };
  if (children) {
    return (
      // @ts-expect-error -- too complex types
      <Tag
        suppressHydrationWarning
        {...props}
        data-testid="switch"
        // skipcq: JS-0417
        onClick={handleModeSwitch}
      >
        {/* @ts-expect-error -> we are setting the CSS variable */}
        <div className={styles.switch} style={{ "--size": `${size}px` }} />
        {children}
      </Tag>
    );
  }
  return (
    <Tag
      // Hydration warning is caused when the data from localStorage differs from the default data provided while rendering on server
      suppressHydrationWarning
      {...props}
      className={[props.className, styles.switch].join(" ")}
      // @ts-expect-error -> we are setting the CSS variable
      style={{ "--size": `${size}px` }}
      data-testid="switch"
      // skipcq: JS-0417 -> tradeoff between size and best practices
      onClick={handleModeSwitch}
    />
  );
};
