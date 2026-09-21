/**
 * ThemeProvider — applies the appearance store to the DOM on every change
 * (CSS vars + data attributes). The whole UI reads live CSS vars, so theme,
 * density, and font-size switches take effect without reloads.
 */

import { useEffect, type ReactNode } from "react";

import { applyAppearance } from "./applyTheme";
import { useAppearance } from "./settings";

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const theme = useAppearance((s) => s.theme);
  const density = useAppearance((s) => s.density);
  const fontSize = useAppearance((s) => s.fontSize);

  useEffect(() => {
    applyAppearance(theme, density, fontSize);
  }, [theme, density, fontSize]);

  return <>{children}</>;
}
