/**
 * NumberField keyboard + clamp tests (P1-T02 verify).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { NumberField } from "./NumberField";

function Harness(props: { min?: number; max?: number; step?: number; suffix?: string }): React.JSX.Element {
  const [v, setV] = useState<number | null>(10);
  return <NumberField label="qty" value={v} onChange={setV} {...props} />;
}

describe("NumberField", () => {
  it("ArrowUp/ArrowDown step by `step`", () => {
    render(<Harness step={5} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // 10 +5 -5 → 10 committed twice
    expect(input.getAttribute("aria-valuenow")).toBe("10");
  });

  it("Shift+ArrowUp multiplies the step (×10)", () => {
    render(<Harness step={5} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true });
    expect(input.getAttribute("aria-valuenow")).toBe("60");
  });

  it("clamps at min/max via steppers and arrow keys", () => {
    render(<Harness min={0} max={100} />);
    const input = screen.getByRole("spinbutton");
    for (let i = 0; i < 95; i++) fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-valuenow")).toBe("100");
    // beyond max stays clamped
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.click(screen.getByRole("button", { name: "increase" }));
    expect(input.getAttribute("aria-valuenow")).toBe("100");
    for (let i = 0; i < 101; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-valuenow")).toBe("0");
  });

  it("Enter commits the typed value; invalid input reverts", () => {
    render(<Harness />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "42.5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-valuenow")).toBe("42.5");
    fireEvent.change(input, { target: { value: "not a number" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-valuenow")).toBe("42.5"); // reverted
  });

  it("typed value below min clamps on commit", () => {
    render(<Harness min={0} max={100} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-50" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-valuenow")).toBe("0");
  });

  it("renders the suffix and empty value support", () => {
    render(<Harness suffix="%" />);
    expect(screen.getByText("%")).toBeTruthy();
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-valuenow")).toBeNull();
  });
});
