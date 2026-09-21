/**
 * Tree primitive (P1-T04) — keyboard-first tree: ArrowUp/Down roving,
 * ArrowRight expand (or descend), ArrowLeft collapse (or ascend),
 * Enter selects. Roving focus is on the tree container (one tab stop).
 */

import { useRef, useState } from "react";

export interface TreeNodeData {
  id: string;
  label: string;
  children?: TreeNodeData[];
}

export interface TreeProps {
  nodes: TreeNodeData[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Accessible name. */
  label?: string;
  /** Start with every node expanded (default true). */
  defaultExpanded?: boolean;
}

interface FlatNode {
  node: TreeNodeData;
  depth: number;
  parentId: string | null;
}

function flatten(nodes: TreeNodeData[], expanded: Set<string>): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (list: TreeNodeData[], depth: number, parentId: string | null): void => {
    for (const node of list) {
      out.push({ node, depth, parentId });
      if (node.children && expanded.has(node.id)) walk(node.children, depth + 1, node.id);
    }
  };
  walk(nodes, 1, null);
  return out;
}

/** pw-backtest tree primitive. */
export function Tree({
  nodes,
  selectedId = null,
  onSelect,
  label = "tree",
  defaultExpanded = true,
}: TreeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!defaultExpanded) return new Set();
    const all = new Set<string>();
    const walk = (list: TreeNodeData[]): void => {
      for (const n of list) {
        if (n.children && n.children.length > 0) {
          all.add(n.id);
          walk(n.children);
        }
      }
    };
    walk(nodes);
    return all;
  });
  const [activeId, setActiveId] = useState<string | null>(nodes[0]?.id ?? null);
  const listRef = useRef<HTMLDivElement>(null);

  const flat = flatten(nodes, expanded);
  const index = flat.findIndex((f) => f.node.id === activeId);

  const setActive = (id: string | null): void => {
    setActiveId(id);
    queueMicrotask(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-tree-id="${id}"]`);
      // jsdom lacks scrollIntoView — runtime guard keeps tests honest
      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
    });
  };

  const move = (delta: number): void => {
    const next = flat[(index === -1 ? 0 : index + delta + flat.length) % flat.length];
    if (next) setActive(next.node.id);
  };

  const toggle = (id: string, open: boolean): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (index === -1) return;
    const current = flat[index];
    const hasChildren = (current.node.children?.length ?? 0) > 0;
    const isOpen = expanded.has(current.node.id);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (hasChildren && !isOpen) toggle(current.node.id, true);
        else move(1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (hasChildren && isOpen) toggle(current.node.id, false);
        else if (current.parentId !== null) setActive(current.parentId);
        break;
      case "Enter":
        e.preventDefault();
        onSelect?.(current.node.id);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={listRef}
      role="tree"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded border border-border bg-bg py-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
    >
      {flat.map(({ node, depth }) => {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const isOpen = expanded.has(node.id);
        const isSelected = node.id === selectedId;
        const isActive = node.id === activeId;
        return (
          <div
            key={node.id}
            data-tree-id={node.id}
            role="treeitem"
            aria-level={depth}
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-selected={isSelected || undefined}
            style={{ paddingLeft: `${(depth - 1) * 16 + 8}px` }}
            onClick={() => {
              setActive(node.id);
              onSelect?.(node.id);
            }}
            className={
              "flex items-center h-7 gap-1.5 pr-2 text-[13px] cursor-pointer select-none " +
              "transition-colors duration-150 ease-out " +
              (isSelected ? "bg-accent/15 text-text" : isActive ? "bg-bg-elev" : "hover:bg-bg-elev")
            }
          >
            {hasChildren ? (
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                aria-hidden="true"
                className={"text-text-3 transition-transform duration-150 " + (isOpen ? "rotate-90" : "")}
              >
                <path d="M2.5 1l4 3-4 3z" fill="currentColor" />
              </svg>
            ) : (
              <span className="inline-block w-2" />
            )}
            <span className="truncate">{node.label}</span>
          </div>
        );
      })}
    </div>
  );
}
