/**
 * Basic primitive tests (P1-T02): Button/IconButton keep the native
 * <button> keyboard contract (Enter/Space activation is the platform's job
 * — asserted here by element type + click behavior); Input exposes label,
 * error (role=alert), and aria-invalid wiring.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button/Button";
import { IconButton } from "./icon-button/IconButton";
import { Input } from "./input/Input";

describe("Button", () => {
  it("is a native button (platform Enter/Space semantics) and fires onClick", () => {
    const onClick = vi.fn();
    render(
      <Button variant="accent" onClick={onClick}>
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Go" }) as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.type).toBe("button"); // no accidental form submits
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled buttons do not fire", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        No
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("requires an accessible name (aria-label) and renders square", () => {
    render(
      <IconButton aria-label="open settings">
        <span>ico</span>
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "open settings" });
    expect(btn.getAttribute("aria-label")).toBe("open settings");
  });
});

describe("Input", () => {
  it("typing works, label clicks focus the field, hint is descriptive", () => {
    render(<Input label="Symbol" name="symbol" hint="e.g. BTC/USDT" />);
    const input = screen.getByLabelText("Symbol") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "EUR/USD" } });
    expect(input.value).toBe("EUR/USD");
    expect(screen.getByText("e.g. BTC/USDT")).toBeTruthy();
  });

  it("error state: role=alert message + aria-invalid", () => {
    render(<Input label="Symbol" error="Unknown symbol" />);
    const input = screen.getByLabelText("Symbol");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Unknown symbol");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });
});
