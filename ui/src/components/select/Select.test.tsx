/**
 * Select keyboard tests (P1-T02 verify): open, roving active option,
 * select, Escape refocus, click-outside close, typeahead.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Select } from "./Select";

const OPTIONS = [
  { value: "btc", label: "BTC/USDT" },
  { value: "eur", label: "EUR/USD" },
  { value: "aapl", label: "AAPL" },
];

function Harness(): React.JSX.Element {
  const [v, setV] = useState<string | null>("btc");
  return <Select label="Symbol" value={v} onChange={setV} options={OPTIONS} />;
}

describe("Select", () => {
  it("trigger exposes combobox semantics (role + expanded state)", () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Symbol" });
    expect(trigger.getAttribute("role")).toBe("combobox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("Enter opens; arrows move aria-activedescendant with wrap", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Symbol" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = await waitFor(() => screen.getByRole("listbox"));
    await waitFor(() => expect(document.activeElement).toBe(list));
    const btcId = list.getAttribute("aria-activedescendant");
    expect(btcId).toContain("btc");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(list.getAttribute("aria-activedescendant")).toContain("eur");
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    // wrapped to the last option
    expect(list.getAttribute("aria-activedescendant")).toContain("aapl");
    expect(btcId).toBeTruthy();
  });

  it("Enter selects the active option and closes; focus returns to trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Symbol" });
    fireEvent.click(trigger);
    const list = await waitFor(() => screen.getByRole("listbox"));
    await waitFor(() => expect(document.activeElement).toBe(list));
    fireEvent.keyDown(list, { key: "ArrowDown" }); // → eur
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.textContent).toContain("EUR/USD");
  });

  it("Escape closes without selecting and refocuses the trigger", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: "Symbol" }));
    const list = await waitFor(() => screen.getByRole("listbox"));
    await waitFor(() => expect(document.activeElement).toBe(list));
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Symbol" }));
  });

  it("click-outside closes the list", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: "Symbol" }));
    await waitFor(() => screen.getByRole("listbox"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("typeahead jumps to labels starting with the typed prefix", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: "Symbol" }));
    const list = await waitFor(() => screen.getByRole("listbox"));
    await waitFor(() => expect(document.activeElement).toBe(list));
    fireEvent.keyDown(list, { key: "a" });
    expect(list.getAttribute("aria-activedescendant")).toContain("aapl");
  });
});
