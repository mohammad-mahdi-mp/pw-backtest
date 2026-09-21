/**
 * Menu keyboard tests (P1-T02 verify): DropdownMenu roving + selection +
 * Escape refocus + click-outside; ContextMenu open-at-pointer + Escape.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../button/Button";
import { DropdownMenu } from "./DropdownMenu";
import { ContextMenu } from "./ContextMenu";
import type { MenuEntry } from "./MenuList";

const ENTRIES: MenuEntry[] = [
  { kind: "item", id: "open", label: "Open", onSelect: () => {} },
  { kind: "separator", id: "s1" },
  { kind: "item", id: "off", label: "Off", disabled: true, onSelect: () => {} },
  { kind: "item", id: "danger", label: "Reset", danger: true, onSelect: () => {} },
];

function DropdownHarness(): React.JSX.Element {
  return (
    <DropdownMenu trigger={(props) => <Button {...props}>Menu</Button>} entries={ENTRIES} />
  );
}

describe("DropdownMenu", () => {
  it("trigger exposes menu semantics; open focuses the list", async () => {
    render(<DropdownHarness />);
    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(trigger);
    const menu = await waitFor(() => screen.getByRole("menu"));
    await waitFor(() => expect(document.activeElement).toBe(menu));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("ArrowDown skips separators and disabled items; wraps", async () => {
    render(<DropdownHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = await waitFor(() => screen.getByRole("menu"));
    await waitFor(() => expect(document.activeElement).toBe(menu));
    expect(menu.getAttribute("aria-activedescendant")).toContain("open");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    // separator "s1" and disabled "off" are skipped → danger
    expect(menu.getAttribute("aria-activedescendant")).toContain("danger");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(menu.getAttribute("aria-activedescendant")).toContain("open"); // wrapped
  });

  it("Enter selects and closes; focus restores to the trigger", async () => {
    const { container } = render(<DropdownHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = await waitFor(() => screen.getByRole("menu"));
    await waitFor(() => expect(document.activeElement).toBe(menu));
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(container.textContent).toContain("Menu");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menu" }));
  });

  it("Escape closes and refocuses the trigger", async () => {
    render(<DropdownHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = await waitFor(() => screen.getByRole("menu"));
    await waitFor(() => expect(document.activeElement).toBe(menu));
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menu" }));
  });

  it("click-outside closes", async () => {
    render(<DropdownHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await waitFor(() => screen.getByRole("menu"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("ContextMenu", () => {
  it("right-click opens at the pointer position; Escape closes", async () => {
    let picked = "";
    const entries: MenuEntry[] = [
      { kind: "item", id: "snap", label: "Snapshot", onSelect: () => (picked = "snap") },
    ];
    render(
      <ContextMenu entries={entries} className="area">
        <div>target</div>
      </ContextMenu>,
    );
    const area = document.querySelector(".area") as HTMLElement;
    fireEvent.contextMenu(area, { clientX: 120, clientY: 80 });
    const menu = await waitFor(() => screen.getByRole("menu"));
    const popup = menu.closest("[data-contextmenu-popup]") as HTMLElement;
    expect(popup.style.left).toBe("120px");
    expect(popup.style.top).toBe("80px");
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(picked).toBe("snap");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape closes without selecting", async () => {
    const entries: MenuEntry[] = [{ kind: "item", id: "x", label: "X", onSelect: () => {} }];
    render(
      <ContextMenu entries={entries}>
        <div>target</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(document.querySelector("[data-contextmenu]") as HTMLElement);
    const menu = await waitFor(() => screen.getByRole("menu"));
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
