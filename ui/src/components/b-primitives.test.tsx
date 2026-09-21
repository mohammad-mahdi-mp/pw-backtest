/**
 * Primitives B tests (P1-T03): Dialog (focus trap, Esc, focus restore),
 * FloatingPanel (drag + persistence), Tabs (roving), Toasts (queue,
 * auto-dismiss), Switch/Slider/Progress semantics.
 */

import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button/Button";
import { Dialog } from "./dialog/Dialog";
import { FloatingPanel } from "./floating-panel/FloatingPanel";
import { Tabs } from "./tabs/Tabs";
import { Toasts, } from "./toast/Toasts";
import { toast, useToasts } from "./toast/store";
import { Switch } from "./switch/Switch";
import { Slider } from "./slider/Slider";
import { Progress } from "./progress/Progress";

afterEach(() => {
  localStorage.clear();
  useToasts.setState({ toasts: [] });
  vi.useRealTimers();
});

describe("Dialog", () => {
  function Harness(): React.JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>open</Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Confirm"
          footer={
            <>
              <Button data-autofocus onClick={() => setOpen(false)}>
                OK
              </Button>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </>
          }
        >
          <p>body</p>
        </Dialog>
      </>
    );
  }

  it("opens with role=dialog, aria-modal, autofocus inside", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = await waitFor(() => screen.getByRole("dialog"));
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => {
      const inDialog = dialog.contains(document.activeElement);
      expect(inDialog).toBe(true);
    });
  });

  it("Escape closes and focus returns to the opener", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("Tab wraps inside the dialog (focus trap)", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = await waitFor(() => screen.getByRole("dialog"));
    const buttons = dialog.querySelectorAll("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: "Tab" });
    // wrapped to the first focusable inside
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  it("overlay click closes", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    await waitFor(() => screen.getByRole("dialog"));
    const overlay = document.querySelector('[data-dialog-overlay="true"]') as HTMLElement;
    fireEvent.mouseDown(overlay.firstElementChild as Element); // panel — no close
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.mouseDown(overlay); // overlay itself closes
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("FloatingPanel", () => {
  it("drags via the header and persists the position across remounts", () => {
    const key = `test-${Math.random()}`;
    const first = render(
      <FloatingPanel storageKey={key} title="Panel" initialX={10} initialY={20}>
        content
      </FloatingPanel>,
    );
    const panel = first.container.querySelector("[data-floating-panel]") as HTMLElement;
    expect(panel.style.left).toBe("10px");

    const header = panel.querySelector("[data-drag-handle]") as HTMLElement;
    fireEvent.mouseDown(header, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 150 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 150 });
    expect(panel.style.left).toBe("50px");
    expect(panel.style.top).toBe("70px");

    first.unmount();
    const second = render(
      <FloatingPanel storageKey={key} title="Panel" initialX={10} initialY={20}>
        content
      </FloatingPanel>,
    );
    const restored = second.container.querySelector("[data-floating-panel]") as HTMLElement;
    expect(restored.style.left).toBe("50px");
    expect(restored.style.top).toBe("70px");
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];

  it("roles + click selection + arrow roving with focus", async () => {
    const Harness = (): React.JSX.Element => {
      const [active, setActive] = useState("a");
      return <Tabs label="t" tabs={tabs} active={active} onChange={setActive} />;
    };
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "t" });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Alpha" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(list, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true"),
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Beta" })));

    fireEvent.keyDown(list, { key: "Home" });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Alpha" }).getAttribute("aria-selected")).toBe("true"),
    );
  });
});

describe("Toasts", () => {
  it("renders the queue in order with dismissal", () => {
    render(<Toasts />);
    act(() => {
      toast.info("first");
      toast.error("second");
    });
    const stack = screen.getByRole("status");
    expect(stack.textContent).toContain("first");
    expect(stack.textContent).toContain("second");
    const items = stack.querySelectorAll("[data-toast-kind]");
    expect(items[0].getAttribute("data-toast-kind")).toBe("info");
    fireEvent.click(items[0].querySelector("button") as HTMLButtonElement);
    expect(stack.textContent).not.toContain("first");
  });

  it("auto-dismisses after 4s", () => {
    vi.useFakeTimers();
    render(<Toasts />);
    act(() => {
      toast.info("bye");
    });
    expect(screen.getByRole("status").textContent).toContain("bye");
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Switch / Slider / Progress", () => {
  it("switch toggles with aria-checked", () => {
    const Harness = (): React.JSX.Element => {
      const [on, setOn] = useState(false);
      return <Switch label="trailing" checked={on} onChange={setOn} />;
    };
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "trailing" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("slider is a labeled range input firing numeric changes", () => {
    const onChange = vi.fn();
    render(<Slider label="speed" value={30} min={1} max={100} onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "speed" }) as HTMLInputElement;
    expect(input.type).toBe("range");
    fireEvent.change(input, { target: { value: "55" } });
    expect(onChange).toHaveBeenCalledWith(55);
  });

  it("progress reports aria values; indeterminate has none", () => {
    render(
      <>
        <Progress label="download" value={64} />
        <Progress label="working" />
      </>,
    );
    expect(screen.getByRole("progressbar", { name: "download" }).getAttribute("aria-valuenow")).toBe("64");
    expect(screen.getByRole("progressbar", { name: "working" }).getAttribute("aria-valuenow")).toBeNull();
  });
});
