import React, { useMemo } from "react";

const COUNT_COLORS = {
  1: "var(--ms-count-1)",
  2: "var(--ms-count-2)",
  3: "var(--ms-count-3)",
  4: "var(--ms-count-4)",
  5: "var(--ms-count-5)",
  6: "var(--ms-count-6)",
  7: "var(--ms-count-7)",
  8: "var(--ms-count-8)",
};

/**
 * PUBLIC_INTERFACE
 * Single cell in the Minesweeper grid.
 */
export default function Cell({ cell, isLocked, onReveal, onFlag }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (isLocked) return;
    onReveal();
  };

  const handleContextMenu = (e) => {
    e.preventDefault(); // prevent browser context menu
    if (isLocked) return;
    onFlag();
  };

  const label = useMemo(() => {
    if (cell.isRevealed) {
      if (cell.isMine) return "Mine";
      if (cell.adjacentMines > 0) return `${cell.adjacentMines} adjacent mines`;
      return "Empty";
    }
    if (cell.isFlagged) return "Flagged";
    return "Hidden";
  }, [cell.adjacentMines, cell.isFlagged, cell.isMine, cell.isRevealed]);

  const countStyle =
    cell.isRevealed && !cell.isMine && cell.adjacentMines > 0
      ? { color: COUNT_COLORS[cell.adjacentMines] ?? "var(--ms-text)" }
      : undefined;

  let content = null;
  if (cell.isRevealed) {
    if (cell.isMine) content = "●";
    else if (cell.adjacentMines > 0) content = cell.adjacentMines;
  } else if (cell.isFlagged) {
    content = "⚑";
  }

  return (
    <button
      type="button"
      className={[
        "ms-cell",
        cell.isRevealed ? "is-revealed" : "is-hidden",
        cell.isFlagged ? "is-flagged" : "",
        cell.isRevealed && cell.isMine ? "is-mine" : "",
      ].join(" ")}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      aria-label={label}
      aria-disabled={isLocked}
      disabled={false /* keep focus/hover even when game ended; logic blocks actions */}
      style={countStyle}
    >
      <span className="ms-cell-content" aria-hidden="true">
        {content}
      </span>
    </button>
  );
}
