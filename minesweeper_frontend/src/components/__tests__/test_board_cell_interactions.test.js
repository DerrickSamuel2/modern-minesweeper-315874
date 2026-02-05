import { act, render, screen, within } from "@testing-library/react";
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
 *
 * Note: Some tests use fake timers to avoid React "act(...)" warnings caused by
 * the hook timer's setInterval updating state during real-time waits.
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

function getMinesRemainingValue() {
  // Avoid ambiguity with cell numbers by selecting the stat *by label*.
  const minesLabel = screen.getByText(/^Mines$/i);
  const stat = minesLabel.closest(".ms-stat");
  if (!stat) throw new Error("Unable to locate Mines stat container");
  const valueEl = within(stat).getByText(/^\d+$/);
  return Number(valueEl.textContent);
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

    // There should be at least one revealed cell (not labeled Hidden).
    const revealedAny =
      within(board).queryAllByLabelText("Mine").length +
      within(board).queryAllByLabelText(/adjacent mines/i).length +
      within(board).queryAllByLabelText("Empty").length;

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

    const minesRemainingBefore = getMinesRemainingValue();

    await rightClick(user, hiddenCells[0]);
    expect(within(board).getAllByLabelText("Flagged").length).toBeGreaterThan(0);
    expect(getMinesRemainingValue()).toBe(minesRemainingBefore - 1);

    // Unflag
    const flaggedCells = within(board).getAllByLabelText("Flagged");
    await rightClick(user, flaggedCells[0]);
    expect(within(board).queryAllByLabelText("Flagged").length).toBe(0);
    expect(getMinesRemainingValue()).toBe(minesRemainingBefore);
  });

  test("clicking a mine triggers immediate loss, reveals all mines, stops timer, and locks interactions", async () => {
    jest.useFakeTimers();

    const user = userEvent.setup();
    render(<App />);

    const board = getBoard();

    // First click to place mines and start timer.
    await user.click(getAllCells(board)[0]);

    // Advance timers to ensure at least one tick; wrap in act to avoid warnings.
    const timeBefore = getTimeText().textContent;
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    const timeAfter = getTimeText().textContent;
    expect(timeAfter).not.toBe(timeBefore);

    // Now keep clicking hidden cells until we lose. Cap to avoid infinite loops.
    let lost = false;
    for (let i = 0; i < 300; i += 1) {
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
    act(() => {
      jest.advanceTimersByTime(2000);
    });
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

    jest.useRealTimers();
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
    const anyRevealed =
      within(board).queryAllByLabelText("Empty").length +
      within(board).queryAllByLabelText(/adjacent mines/i).length +
      within(board).queryAllByLabelText("Mine").length;

    expect(anyRevealed).toBeGreaterThan(0);
  });
});
