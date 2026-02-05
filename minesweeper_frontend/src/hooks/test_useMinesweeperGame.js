import { act, renderHook } from "@testing-library/react";
import { useMinesweeperGame } from "./useMinesweeperGame";

/**
 * Helper to count mines in the current grid.
 * @param {ReturnType<typeof useMinesweeperGame>["grid"]} grid
 */
function countMines(grid) {
  return grid.flat().filter((c) => c.isMine).length;
}

/**
 * Helper to collect neighbor coordinates.
 * (Test-local implementation; we intentionally avoid importing internals.)
 */
function neighbors(rows, cols, r, c) {
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

describe("useMinesweeperGame (core game logic)", () => {
  test("board initialization: creates an empty unrevealed/unflagged grid and status=ready", () => {
    const { result } = renderHook(() =>
      useMinesweeperGame({ rows: 3, cols: 4, mines: 2 })
    );

    expect(result.current.status).toBe("ready");
    expect(result.current.isLocked).toBe(false);
    expect(result.current.grid).toHaveLength(3);
    expect(result.current.grid[0]).toHaveLength(4);

    const allCells = result.current.grid.flat();
    expect(allCells.every((c) => c.isRevealed === false)).toBe(true);
    expect(allCells.every((c) => c.isFlagged === false)).toBe(true);

    // Critical invariant: no mines are placed before the first click.
    expect(allCells.every((c) => c.isMine === false)).toBe(true);
    expect(result.current.revealedSafeCount).toBe(0);
    expect(result.current.flagsUsed).toBe(0);
    expect(result.current.minesRemaining).toBe(2);
    expect(result.current.secondsElapsed).toBe(0);
  });

  test("first-click behavior: first reveal is always safe and mines are placed after first click excluding clicked cell and neighbors", () => {
    const rows = 9;
    const cols = 9;
    const mines = 10;

    const safeR = 0;
    const safeC = 0;

    const { result } = renderHook(() =>
      useMinesweeperGame({ rows, cols, mines })
    );

    act(() => {
      result.current.actions.reveal(safeR, safeC);
    });

    // First click transitions ready -> playing
    expect(result.current.status).toBe("playing");

    // Mines should now be placed
    const mineCount = countMines(result.current.grid);
    expect(mineCount).toBe(mines);

    // Clicked cell and its neighbors are guaranteed not to be mines.
    const safeCoords = [
      [safeR, safeC],
      ...neighbors(rows, cols, safeR, safeC),
    ];
    for (const [r, c] of safeCoords) {
      expect(result.current.grid[r][c].isMine).toBe(false);
    }

    // First clicked cell is revealed and not a mine
    expect(result.current.grid[safeR][safeC].isRevealed).toBe(true);
    expect(result.current.grid[safeR][safeC].isMine).toBe(false);
  });

  test("reveal mechanics: revealing a 0-adjacent cell flood-fills empty region and reveals boundary numbers", () => {
    // Use a board size where safe zone doesn't prevent mine placement and where
    // there are typically some zeros.
    const { result } = renderHook(() =>
      useMinesweeperGame({ rows: 9, cols: 9, mines: 10 })
    );

    // First click somewhere central to create a fair safe zone.
    act(() => {
      result.current.actions.reveal(4, 4);
    });

    // Find a revealed zero cell (common after flood fill on a real minesweeper board).
    const zeroCells = result.current.grid
      .flat()
      .filter((c) => c.isRevealed && c.adjacentMines === 0 && !c.isMine);

    expect(zeroCells.length).toBeGreaterThan(0);

    // Flood fill should have revealed more than one cell.
    const revealedAfterFirst = result.current.grid
      .flat()
      .filter((c) => c.isRevealed).length;
    expect(revealedAfterFirst).toBeGreaterThan(1);

    // There should also typically be some revealed boundary numbers (>0 adjacent mines).
    // (This is a probabilistic assertion but extremely likely with standard beginner settings.)
    const revealedNumbers = result.current.grid
      .flat()
      .filter((c) => c.isRevealed && c.adjacentMines > 0 && !c.isMine);
    expect(revealedNumbers.length).toBeGreaterThan(0);

    // revealedSafeCount should match the number of revealed non-mine cells.
    const revealedSafeCells = result.current.grid
      .flat()
      .filter((c) => c.isRevealed && !c.isMine).length;
    expect(result.current.revealedSafeCount).toBe(revealedSafeCells);
  });

  test("flag toggling rules: cannot flag revealed cells; cannot exceed mines count; minesRemaining updates", () => {
    const mines = 2;
    const { result } = renderHook(() =>
      useMinesweeperGame({ rows: 3, cols: 3, mines })
    );

    // Place mines by first reveal (also reveals at least one cell)
    act(() => {
      result.current.actions.reveal(0, 0);
    });

    // Find a hidden safe cell to flag (we only need hidden; could be mine or safe).
    const hiddenCoords = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        if (!result.current.grid[r][c].isRevealed) hiddenCoords.push([r, c]);
      }
    }
    expect(hiddenCoords.length).toBeGreaterThan(0);

    // Flag up to mine limit.
    act(() => {
      result.current.actions.toggleFlag(hiddenCoords[0][0], hiddenCoords[0][1]);
      result.current.actions.toggleFlag(hiddenCoords[1][0], hiddenCoords[1][1]);
    });
    expect(result.current.flagsUsed).toBe(2);
    expect(result.current.minesRemaining).toBe(0);

    // Attempt to place a 3rd flag should be blocked.
    if (hiddenCoords.length >= 3) {
      const [r3, c3] = hiddenCoords[2];
      act(() => {
        result.current.actions.toggleFlag(r3, c3);
      });
      expect(result.current.grid[r3][c3].isFlagged).toBe(false);
      expect(result.current.flagsUsed).toBe(2);
      expect(result.current.minesRemaining).toBe(0);
    }

    // Unflag one flag should decrease flagsUsed and increase minesRemaining.
    const [r1, c1] = hiddenCoords[0];
    act(() => {
      result.current.actions.toggleFlag(r1, c1);
    });
    expect(result.current.grid[r1][c1].isFlagged).toBe(false);
    expect(result.current.flagsUsed).toBe(1);
    expect(result.current.minesRemaining).toBe(1);

    // Cannot flag a revealed cell.
    const revealedCell = result.current.grid.flat().find((c) => c.isRevealed);
    expect(revealedCell).toBeTruthy();
    const { r, c } = revealedCell;
    const before = result.current.grid[r][c].isFlagged;
    act(() => {
      result.current.actions.toggleFlag(r, c);
    });
    expect(result.current.grid[r][c].isFlagged).toBe(before);
  });

  test("win condition: game is won when all safe cells are revealed (uses actual mines placed on first click)", () => {
    // 3x3 board: first click safe zone is the entire board (cell + all neighbors),
    // so actual mines placed becomes 0 (mines clamped by available positions).
    const { result } = renderHook(() =>
      useMinesweeperGame({ rows: 3, cols: 3, mines: 8 })
    );

    act(() => {
      result.current.actions.reveal(1, 1);
    });

    // Mines must be 0 due to safeSet covering all cells, hence totalSafeCells is 9.
    expect(countMines(result.current.grid)).toBe(0);

    // Revealing any cell when there are zero mines should flood reveal all safe cells.
    const revealedSafeCells = result.current.grid
      .flat()
      .filter((c) => c.isRevealed && !c.isMine).length;
    expect(revealedSafeCells).toBe(9);
    expect(result.current.revealedSafeCount).toBe(9);

    // Win is computed via effect, but should settle immediately in RTL's act flush.
    expect(result.current.status).toBe("won");
    expect(result.current.isLocked).toBe(true);
  });

  test("lose condition: revealing a mine triggers loss, reveals all mines, and locks further interactions", () => {
    jest.useFakeTimers();

    const { result } = renderHook(() =>
      useMinesweeperGame({ rows: 9, cols: 9, mines: 10 })
    );

    // First click to place mines and start timer.
    act(() => {
      result.current.actions.reveal(0, 0);
    });
    expect(result.current.status).toBe("playing");

    // Advance time a bit to ensure timer increments.
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    const timeBeforeLoss = result.current.secondsElapsed;
    expect(timeBeforeLoss).toBeGreaterThanOrEqual(2);

    // Find any mine cell and reveal it.
    const mineCell = result.current.grid.flat().find((c) => c.isMine);
    expect(mineCell).toBeTruthy();

    act(() => {
      result.current.actions.reveal(mineCell.r, mineCell.c);
    });

    expect(result.current.status).toBe("lost");
    expect(result.current.isLocked).toBe(true);

    // All mines should be revealed after loss.
    const allMines = result.current.grid.flat().filter((c) => c.isMine);
    expect(allMines.length).toBe(10);
    expect(allMines.every((c) => c.isRevealed)).toBe(true);

    // Timer should stop after losing.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.secondsElapsed).toBe(timeBeforeLoss);

    // Guard rails: no interactions (reveal or flag) when locked.
    const hiddenNonMine = result.current.grid
      .flat()
      .find((c) => !c.isMine && !c.isRevealed);
    if (hiddenNonMine) {
      const beforeRevealed = result.current.grid[hiddenNonMine.r][
        hiddenNonMine.c
      ].isRevealed;
      const beforeFlagged = result.current.grid[hiddenNonMine.r][
        hiddenNonMine.c
      ].isFlagged;

      act(() => {
        result.current.actions.revealOrFlag(hiddenNonMine.r, hiddenNonMine.c, "reveal");
        result.current.actions.revealOrFlag(hiddenNonMine.r, hiddenNonMine.c, "flag");
      });

      expect(
        result.current.grid[hiddenNonMine.r][hiddenNonMine.c].isRevealed
      ).toBe(beforeRevealed);
      expect(
        result.current.grid[hiddenNonMine.r][hiddenNonMine.c].isFlagged
      ).toBe(beforeFlagged);
    }

    jest.useRealTimers();
  });

  test("reset behavior: clears state, creates fresh empty grid, resets timer, and unlocks interactions", () => {
    jest.useFakeTimers();

    const { result } = renderHook(() =>
      useMinesweeperGame({ rows: 9, cols: 9, mines: 10 })
    );

    act(() => {
      result.current.actions.reveal(0, 0);
    });

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.secondsElapsed).toBeGreaterThanOrEqual(1);

    // Make some additional state changes.
    const someHidden = result.current.grid.flat().find((c) => !c.isRevealed);
    if (someHidden) {
      act(() => {
        result.current.actions.toggleFlag(someHidden.r, someHidden.c);
      });
      expect(result.current.flagsUsed).toBeGreaterThanOrEqual(0);
    }

    act(() => {
      result.current.actions.reset();
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.isLocked).toBe(false);
    expect(result.current.secondsElapsed).toBe(0);
    expect(result.current.flagsUsed).toBe(0);
    expect(result.current.revealedSafeCount).toBe(0);
    expect(countMines(result.current.grid)).toBe(0); // mines not placed until first click
    expect(result.current.grid.flat().every((c) => !c.isRevealed)).toBe(true);
    expect(result.current.grid.flat().every((c) => !c.isFlagged)).toBe(true);

    jest.useRealTimers();
  });

  test("guard rails: revealOrFlag does nothing when locked (won state)", () => {
    // Force a deterministic win quickly by creating a board where actual mines becomes 0.
    const { result } = renderHook(() =>
      useMinesweeperGame({ rows: 3, cols: 3, mines: 8 })
    );

    act(() => {
      result.current.actions.reveal(1, 1);
    });

    expect(result.current.status).toBe("won");
    expect(result.current.isLocked).toBe(true);

    const snapshot = JSON.stringify(result.current.grid);

    act(() => {
      result.current.actions.revealOrFlag(0, 0, "reveal");
      result.current.actions.revealOrFlag(0, 0, "flag");
    });

    expect(JSON.stringify(result.current.grid)).toBe(snapshot);
    expect(result.current.status).toBe("won");
  });
});
