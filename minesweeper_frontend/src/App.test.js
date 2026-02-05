import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

test("renders minesweeper title", () => {
  render(<App />);
  expect(screen.getByText(/minesweeper/i)).toBeInTheDocument();
});

test("clicking a mine ends the game, reveals mines, stops timer, and disables board interactions", async () => {
  const user = userEvent.setup();
  render(<App />);

  // Start the game with a first safe click.
  const board = screen.getByRole("grid", { name: /minesweeper board/i });
  const cells = within(board).getAllByRole("button");
  await user.click(cells[0]);

  // Now keep clicking until we hit a mine (should happen quickly on 9x9 with 10 mines).
  // Safety cap avoids an infinite loop if something regresses.
  let lost = false;
  for (let i = 1; i < cells.length; i += 1) {
    await user.click(cells[i]);
    if (screen.queryByText(/game over/i)) {
      lost = true;
      break;
    }
  }

  expect(lost).toBe(true);

  // Visual feedback: mines revealed.
  const mineCells = within(board).getAllByLabelText("Mine");
  expect(mineCells.length).toBeGreaterThan(0);

  // Timer should stop after losing: capture current time and ensure it doesn't change.
  const timeValue = screen.getByText(/^\d+:\d{2}$/);
  const timeAtLoss = timeValue.textContent;

  await new Promise((r) => setTimeout(r, 1100));
  expect(screen.getByText(/^\d+:\d{2}$/).textContent).toBe(timeAtLoss);

  // Further interactions should be disabled:
  // Clicking a hidden cell should not reveal it (aria-label should remain "Hidden").
  const hiddenBefore = within(board).queryAllByLabelText("Hidden").length;
  if (hiddenBefore > 0) {
    const aHiddenCell = within(board).getAllByLabelText("Hidden")[0];
    await user.click(aHiddenCell);
    const hiddenAfter = within(board).queryAllByLabelText("Hidden").length;
    expect(hiddenAfter).toBe(hiddenBefore);
  }

  // Right-click should also be blocked after loss (no new flags placed).
  const flaggedBefore = within(board).queryAllByLabelText("Flagged").length;
  const hiddenCells = within(board).queryAllByLabelText("Hidden");
  if (hiddenCells.length > 0) {
    await user.pointer([{ target: hiddenCells[0], keys: "[MouseRight]" }]);
  }
  const flaggedAfter = within(board).queryAllByLabelText("Flagged").length;
  expect(flaggedAfter).toBe(flaggedBefore);
});
