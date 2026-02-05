import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * @typedef {"ready"|"playing"|"won"|"lost"} GameStatus
 */

/**
 * @typedef {Object} CellModel
 * @property {number} r
 * @property {number} c
 * @property {boolean} isMine
 * @property {number} adjacentMines
 * @property {boolean} isRevealed
 * @property {boolean} isFlagged
 */

/**
 * Create a deterministic key for a cell.
 * @param {number} r
 * @param {number} c
 */
function keyOf(r, c) {
  return `${r},${c}`;
}

/**
 * Get neighbor coordinates (8-direction).
 * @param {number} rows
 * @param {number} cols
 * @param {number} r
 * @param {number} c
 * @returns {Array<[number, number]>}
 */
function getNeighbors(rows, cols, r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      out.push([nr, nc]);
    }
  }
  return out;
}

/**
 * Build an empty grid (no mines placed).
 * @param {number} rows
 * @param {number} cols
 * @returns {CellModel[][]}
 */
function createEmptyGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      row.push({
        r,
        c,
        isMine: false,
        adjacentMines: 0,
        isRevealed: false,
        isFlagged: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Place mines randomly, excluding the first-click cell and its neighbors (so first click feels fair).
 * @param {CellModel[][]} baseGrid
 * @param {number} mineCount
 * @param {number} safeR
 * @param {number} safeC
 * @returns {CellModel[][]}
 */
function placeMinesAndComputeCounts(baseGrid, mineCount, safeR, safeC) {
  const rows = baseGrid.length;
  const cols = baseGrid[0]?.length ?? 0;

  const safeSet = new Set([keyOf(safeR, safeC)]);
  for (const [nr, nc] of getNeighbors(rows, cols, safeR, safeC)) {
    safeSet.add(keyOf(nr, nc));
  }

  const all = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (safeSet.has(keyOf(r, c))) continue;
      all.push([r, c]);
    }
  }

  // Shuffle coordinates (Fisher-Yates)
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  const grid = baseGrid.map((row) => row.map((cell) => ({ ...cell })));

  const minesToPlace = Math.min(mineCount, all.length);
  for (let i = 0; i < minesToPlace; i += 1) {
    const [r, c] = all[i];
    grid[r][c].isMine = true;
  }

  // Compute adjacent mine counts
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (grid[r][c].isMine) {
        grid[r][c].adjacentMines = 0;
        continue;
      }
      let count = 0;
      for (const [nr, nc] of getNeighbors(rows, cols, r, c)) {
        if (grid[nr][nc].isMine) count += 1;
      }
      grid[r][c].adjacentMines = count;
    }
  }

  return { grid, minesPlaced: minesToPlace };
}

/**
 * Reveal cells using flood-fill from an empty (0-adjacent) cell.
 * @param {CellModel[][]} grid
 * @param {number} startR
 * @param {number} startC
 * @returns {{grid: CellModel[][], revealedCountDelta: number}}
 */
function floodReveal(grid, startR, startC) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  const next = grid.map((row) => row.map((cell) => ({ ...cell })));
  let revealedCountDelta = 0;

  const q = [[startR, startC]];
  const visited = new Set();

  while (q.length) {
    const [r, c] = q.shift();
    const k = keyOf(r, c);
    if (visited.has(k)) continue;
    visited.add(k);

    const cell = next[r][c];
    if (cell.isRevealed || cell.isFlagged) continue;
    if (cell.isMine) continue; // shouldn't happen for flood, but safe.

    cell.isRevealed = true;
    revealedCountDelta += 1;

    // Only expand through empty cells
    if (cell.adjacentMines === 0) {
      for (const [nr, nc] of getNeighbors(rows, cols, r, c)) {
        const neighbor = next[nr][nc];
        if (neighbor.isRevealed || neighbor.isFlagged) continue;
        if (neighbor.isMine) continue;
        q.push([nr, nc]);
      }
    }
  }

  return { grid: next, revealedCountDelta };
}

/**
 * Reveal all mines when losing.
 * @param {CellModel[][]} grid
 * @returns {CellModel[][]}
 */
function revealAllMines(grid) {
  return grid.map((row) =>
    row.map((cell) => {
      if (!cell.isMine) return cell;
      return { ...cell, isRevealed: true };
    })
  );
}

/**
 * @typedef {Object} UseMinesweeperGameOptions
 * @property {number} rows
 * @property {number} cols
 * @property {number} mines
 */

/**
 * PUBLIC_INTERFACE
 * Hook that encapsulates Minesweeper state and actions.
 * @param {UseMinesweeperGameOptions} options
 */
export function useMinesweeperGame(options) {
  const { rows, cols, mines } = options;

  const [status, setStatus] = useState(/** @type {GameStatus} */ ("ready"));
  const [grid, setGrid] = useState(() => createEmptyGrid(rows, cols));
  const [flagMode, setFlagMode] = useState(false);

  const [flagsUsed, setFlagsUsed] = useState(0);
  const [revealedSafeCount, setRevealedSafeCount] = useState(0);

  // Tracks the *actual* number of mines placed after the first click.
  // This can be lower than the configured `mines` when the safe zone is large
  // (e.g., tiny boards), and win detection must use this value.
  const [actualMines, setActualMines] = useState(mines);

  const totalSafeCells = useMemo(
    () => rows * cols - actualMines,
    [rows, cols, actualMines]
  );

  const [secondsElapsed, setSecondsElapsed] = useState(0);

  const minesPlacedRef = useRef(false);
  const timerRef = useRef(/** @type {number | null} */ (null));

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimerIfNeeded = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = window.setInterval(() => {
      setSecondsElapsed((s) => s + 1);
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    setStatus("ready");
    setGrid(createEmptyGrid(rows, cols));
    setFlagMode(false);
    setFlagsUsed(0);
    setRevealedSafeCount(0);
    setActualMines(mines);
    setSecondsElapsed(0);
    minesPlacedRef.current = false;
  }, [rows, cols, mines, stopTimer]);

  // Ensure grid resets if dimensions change
  useEffect(() => {
    reset();
  }, [reset]);

  const endGame = useCallback(
    (nextStatus) => {
      setStatus(nextStatus);
      stopTimer();
    },
    [stopTimer]
  );

  const maybeWin = useCallback(
    (nextRevealedSafeCount) => {
      // Don't allow a win check until mines are actually placed; this also
      // avoids using a stale/incorrect safe-cell threshold.
      if (!minesPlacedRef.current) return;

      if (nextRevealedSafeCount >= totalSafeCells) {
        endGame("won");
      }
    },
    [endGame, totalSafeCells]
  );

  const toggleFlagMode = useCallback(() => {
    setFlagMode((v) => !v);
  }, []);

  const toggleFlag = useCallback(
    (r, c) => {
      if (status === "won" || status === "lost") return;

      setGrid((prev) => {
        const cell = prev[r][c];
        if (cell.isRevealed) return prev;

        const next = prev.map((row) => row.map((cc) => ({ ...cc })));
        const target = next[r][c];

        if (!target.isFlagged && flagsUsed >= mines) {
          // Prevent placing more flags than mines; keep UX simple.
          return prev;
        }

        target.isFlagged = !target.isFlagged;
        setFlagsUsed((f) => f + (target.isFlagged ? 1 : -1));
        return next;
      });
    },
    [flagsUsed, mines, status]
  );

  const reveal = useCallback(
    (r, c) => {
      if (status === "won" || status === "lost") return;

      // First reveal starts the game + timer
      if (status === "ready") {
        setStatus("playing");
      }
      startTimerIfNeeded();

      // IMPORTANT: keep the setGrid updater PURE (no side-effects like setStatus/stopTimer/etc).
      // React 18 StrictMode may invoke updater functions more than once during development,
      // so side-effects inside updaters can lead to unreliable game-over propagation.
      let didHitMine = false;
      let revealedCountDeltaOuter = 0;

      setGrid((prev) => {
        let working = prev;

        // Place mines on first reveal to guarantee a safe initial click.
        if (!minesPlacedRef.current) {
          const placed = placeMinesAndComputeCounts(working, mines, r, c);
          working = placed.grid;
          setActualMines(placed.minesPlaced);
          minesPlacedRef.current = true;
        }

        const cell = working[r][c];
        if (cell.isRevealed || cell.isFlagged) return working;

        if (cell.isMine) {
          didHitMine = true;
          return revealAllMines(working);
        }

        const { grid: nextGrid, revealedCountDelta } = floodReveal(
          working,
          r,
          c
        );

        revealedCountDeltaOuter = revealedCountDelta;
        return nextGrid;
      });

      // Apply side-effects after state calculation.
      if (didHitMine) {
        endGame("lost");
        return;
      }

      if (revealedCountDeltaOuter > 0) {
        setRevealedSafeCount((count) => count + revealedCountDeltaOuter);
      }
    },
    [endGame, mines, startTimerIfNeeded, status]
  );

  // Evaluate win condition after `revealedSafeCount` updates.
  useEffect(() => {
    maybeWin(revealedSafeCount);
  }, [maybeWin, revealedSafeCount]);

  const revealOrFlag = useCallback(
    (r, c, intent) => {
      if (intent === "flag") {
        toggleFlag(r, c);
        return;
      }
      if (flagMode) {
        toggleFlag(r, c);
        return;
      }
      reveal(r, c);
    },
    [flagMode, reveal, toggleFlag]
  );

  const minesRemaining = useMemo(() => {
    const remaining = mines - flagsUsed;
    return remaining < 0 ? 0 : remaining;
  }, [flagsUsed, mines]);

  return {
    grid,
    rows,
    cols,
    mines,

    status,
    flagMode,
    flagsUsed,
    minesRemaining,
    revealedSafeCount,
    secondsElapsed,

    actions: {
      reset,
      toggleFlagMode,
      reveal,
      toggleFlag,
      revealOrFlag,
      setFlagMode,
    },
  };
}
