import React, { useMemo } from "react";
import Cell from "../Cell/Cell";

/**
 * PUBLIC_INTERFACE
 * Board component for rendering the minesweeper grid.
 */
export default function Board({ grid, status, onReveal, onFlag }) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  const boardStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${cols}, var(--ms-cell-size))`,
      gridTemplateRows: `repeat(${rows}, var(--ms-cell-size))`,
    }),
    [cols, rows]
  );

  return (
    <div
      className={[
        "ms-board",
        status === "won" ? "is-won" : "",
        status === "lost" ? "is-lost" : "",
      ].join(" ")}
      style={boardStyle}
      role="grid"
      aria-label="Minesweeper board"
    >
      {grid.map((row) =>
        row.map((cell) => (
          <Cell
            key={`${cell.r}-${cell.c}`}
            cell={cell}
            disabled={status === "won" || status === "lost"}
            onReveal={() => onReveal(cell.r, cell.c)}
            onFlag={() => onFlag(cell.r, cell.c)}
          />
        ))
      )}
    </div>
  );
}
