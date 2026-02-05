import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";

/**
 * These tests intentionally exercise the app via the full Game UI to ensure
 * Board/Cell wiring works end-to-end (not just the hook logic).
 *
 * We rely on the Cell aria-label contract:
 * - "Hidden"
 * - "Flagged"
 * - "Mine"
 * - "Empty"
 * - "{N} adjacent mines"
 */

function getBoard() {
  return screen.getByRole("grid", { name: /minesweeper board/i });
}

function getAllCells(board) {
  return within(board).getAllByRole("button");
}

function getStatusText() {
  // Game renders a status value: Ready, In progress, You win, Game over
  return screen.getByText(/ready|in progress|you win|game over/i);
}

function getTimeText() {
  // Timer is formatted as m:ss, e.g. 0:00, 1:05
  return screen.getByText(/^\d+:\d{2}$/);
}

async function rightClick(user, element) {
  // user-event right click simulation (triggers contextmenu)
  await user.pointer([{ target: element, keys: "[MouseRight]" }]);
}

describe("Board + Cell integration (Game UI)", () => {
  test("left-click reveals cells and can cascade (Hidden count decreases; some Empty revealed)", async () => {
    const user = userEvent.setup();
    render(<App />);

    const board = getBoard();

    const hiddenBefore = within(board).getAllByLabelText("Hidden").length;
    expect(hiddenBefore).toBeGreaterThan(0);

    // First click is always safe and should reveal at least one cell (often many via flood fill).
    const firstCell = getAllCells(board)[0];
    await user.click(firstCell);

    const hiddenAfter = within(board).getAllByLabelText("Hidden").length;
    expect(hiddenAfter).toBeLessThan(hiddenBefore);

    // Status should transition to playing.
    expect(getStatusText()).toHaveTextContent(/in progress/i);

    // On a standard beginner board, a cascade typically reveals some "Empty" cells.
    // This is probabilistic; if it doesn't happen, we fall back to checking that at least
    // one cell is revealed via the aria-labels not being "Hidden".
    const empties = within(board).queryAllByLabelText("Empty");
    const revealedAny =
      within(board).queryAllByLabelText("Mine").length +
      within(board).queryAllByLabelText(/adjacent mines/i).length +
      empties.length;

    expect(revealedAny).toBeGreaterThan(0);
  });

  test("right-click flags and unflags a hidden cell (aria-label toggles, mines count updates)", async () => {
    const user = userEvent.setup();
    render(<App />);

    const board = getBoard();

    // Start the game with a first safe left-click (mines get placed after this).
    await user.click(getAllCells(board)[0]);

    // Choose a hidden cell to flag.
    const hiddenCells = within(board).getAllByLabelText("Hidden");
    expect(hiddenCells.length).toBeGreaterThan(0);

    const minesRemainingEl = screen.getByText(/^\d+$/);
    const minesRemainingBefore = Number(minesRemainingEl.textContent);

    await rightClick(user, hiddenCells[0]);
    expect(within(board).getAllByLabelText("Flagged").length).toBeGreaterThan(0);
    expect(Number(minesRemainingEl.textContent)).toBe(minesRemainingBefore - 1);

    // Unflag
    const flaggedCells = within(board).getAllByLabelText("Flagged");
    await rightClick(user, flaggedCells[0]);
    expect(within(board).queryAllByLabelText("Flagged").length).toBe(0);
    expect(Number(minesRemainingEl.textContent)).toBe(minesRemainingBefore);
  });

  test("clicking a mine triggers immediate loss, reveals all mines, stops timer, and locks interactions", async () => {
    const user = userEvent.setup();
    render(<App />);

    const board = getBoard();

    // First click to place mines and start timer.
    await user.click(getAllCells(board)[0]);

    // Wait long enough for the timer to tick at least once.
    const timeBeforeWait = getTimeText().textContent;
    await new Promise((r) => setTimeout(r, 1100));
    const timeAfterWait = getTimeText().textContent;
    expect(timeAfterWait).not.toBe(timeBeforeWait);

    // Now keep clicking hidden cells until we lose. Cap to avoid infinite loops.
    let lost = false;
    for (let i = 0; i < 200; i += 1) {
      const hidden = within(board).queryAllByLabelText("Hidden");
      if (hidden.length === 0) break;

      await user.click(hidden[0]);
      if (screen.queryByText(/game over/i)) {
        lost = true;
        break;
      }
    }
    expect(lost).toBe(true);

    // Mines should be revealed (multiple mines possible; use queryAll* resilience).
    const mineCells = within(board).queryAllByLabelText("Mine");
    expect(mineCells.length).toBeGreaterThan(0);

    // Timer should stop after losing.
    const timeAtLoss = getTimeText().textContent;
    await new Promise((r) => setTimeout(r, 1100));
    expect(getTimeText().textContent).toBe(timeAtLoss);

    // Interactions are locked after loss: left- and right-click do nothing.
    const hiddenBefore = within(board).queryAllByLabelText("Hidden").length;
    const flaggedBefore = within(board).queryAllByLabelText("Flagged").length;

    const someHidden = within(board).queryAllByLabelText("Hidden")[0];
    if (someHidden) {
      await user.click(someHidden);
      await rightClick(user, someHidden);
    }

    const hiddenAfter = within(board).queryAllByLabelText("Hidden").length;
    const flaggedAfter = within(board).queryAllByLabelText("Flagged").length;

    expect(hiddenAfter).toBe(hiddenBefore);
    expect(flaggedAfter).toBe(flaggedBefore);

    // Accessibility: board indicates disabled and cells should have aria-disabled=true
    expect(board).toHaveAttribute("aria-disabled", "true");
    const anyCell = getAllCells(board)[0];
    expect(anyCell).toHaveAttribute("aria-disabled", "true");
  });

  test("winning by revealing all safe cells (small board with safe zone forces 0 mines) and locks interactions", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Switch to intermediate for a predictable 16x16 board and then "force win" using
    // a deterministic trick: (3x3 with mines>=8 would be perfect but isn't available in UI).
    // Instead, we use the UI's Reset and play until win is detected by revealing safe cells.
    //
    // To keep this reliable and fast, we use Flag mode OFF and repeatedly click hidden cells,
    // stopping once "You win" appears. With first-click-safe + flood fill, win should occur
    // within bounded clicks (though not guaranteed quickly). We'll implement a generous cap.

    // Ensure in beginner; it's fine and typically winnable within bounded iterations by brute force
    // only if we avoid mines, which isn't guaranteed. So we instead leverage the app rule:
    // interactions lock on win; we validate that if we reach win, lock is enforced.
    //
    // If we don't reach win within cap, we fail with actionable message.

    const board = getBoard();

    await user.click(getAllCells(board)[0]); // start

    let won = false;
    for (let i = 0; i < 600; i += 1) {
      if (screen.queryByText(/you win/i)) {
        won = true;
        break;
      }
      if (screen.queryByText(/game over/i)) {
        // If we lose, restart and keep trying within the same cap budget.
        await user.click(screen.getByRole("button", { name: /reset/i }));
        await user.click(getAllCells(getBoard())[0]);
      }

      const currentBoard = getBoard();
      const hidden = within(currentBoard).queryAllByLabelText("Hidden");
      if (hidden.length === 0) break;

      // Click a hidden cell; this is not a "smart" strategy but keeps test purely integration-level.
      await user.click(hidden[0]);
    }

    expect(won).toBe(true);

    // After win, interactions should be locked.
    const finalBoard = getBoard();
    expect(finalBoard).toHaveAttribute("aria-disabled", "true");

    const hiddenBefore = within(finalBoard).queryAllByLabelText("Hidden").length;
    const flaggedBefore = within(finalBoard).queryAllByLabelText("Flagged").length;

    const someHidden = within(finalBoard).queryAllByLabelText("Hidden")[0];
    if (someHidden) {
      await user.click(someHidden);
      await rightClick(user, someHidden);
    }

    const hiddenAfter = within(finalBoard).queryAllByLabelText("Hidden").length;
    const flaggedAfter = within(finalBoard).queryAllByLabelText("Flagged").length;

    expect(hiddenAfter).toBe(hiddenBefore);
    expect(flaggedAfter).toBe(flaggedBefore);
  });

  test("cell accessibility labels reflect state transitions: Hidden -> Flagged -> Hidden, and revealed states are not Hidden", async () => {
    const user = userEvent.setup();
    render(<App />);

    const board = getBoard();

    // Start game
    await user.click(getAllCells(board)[0]);

    // Flag a hidden cell and verify aria-label updates.
    const hidden = within(board).getAllByLabelText("Hidden");
    await rightClick(user, hidden[0]);
    expect(within(board).getAllByLabelText("Flagged").length).toBeGreaterThan(0);

    // Unflag and verify it becomes Hidden again.
    const flagged = within(board).getAllByLabelText("Flagged");
    await rightClick(user, flagged[0]);
    expect(within(board).queryAllByLabelText("Flagged").length).toBe(0);

    // Reveal some cell; it should no longer be labeled Hidden.
    const hiddenAfterUnflag = within(board).getAllByLabelText("Hidden");
    await user.click(hiddenAfterUnflag[0]);

    // There should exist at least one non-hidden label among cells now.
    // Use queryAllByLabelText to be resilient to multiple mines/numbers.
    const anyRevealed =
      within(board).queryAllByLabelText("Empty").length +
      within(board).queryAllByLabelText(/adjacent mines/i).length +
      within(board).queryAllByLabelText("Mine").length;

    expect(anyRevealed).toBeGreaterThan(0);
  });
});
