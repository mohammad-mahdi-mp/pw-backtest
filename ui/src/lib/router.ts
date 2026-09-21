/**
 * Minimal hash router (no dependency — §1.7 freeze keeps the manifest at the
 * planned packages; a full router is unnecessary for a shell with a handful
 * of top-level routes). Routes are the location hash without the leading
 * `#` (e.g. `#/dev-board` → `/dev-board`); empty hash → `/`.
 */

import { useEffect, useState } from "react";

/** Read the current route from the location hash. */
export function currentRoute(): string {
  const raw = window.location.hash.replace(/^#/, "");
  return raw === "" ? "/" : raw;
}

/** Subscribe to hash-route changes. */
export function useHashRoute(): string {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/** Navigate to a route (hash-based). */
export function navigate(route: string): void {
  window.location.hash = route;
}
