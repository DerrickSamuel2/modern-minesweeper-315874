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
  let mineCell = null;
  for (let i = 1; i < cells.length; i += 1) {
    await user.click(cells[i]);
    // A mine is rendered as "●" (aria-hidden), but the button's aria-label becomes "Mine".
    const maybeMine = within(board).queryByLabelText("Mine");
    if (maybeMine) {
      mineCell = maybeMine;
      break;
    }
  }

  // Confirm we actually lost.
  expect(mineCell).not.toBeNull();
  expect(screen.getByText(/game over/i)).toBeInTheDocument();

  // Visual feedback: mines revealed.
  // (At least one mine cell should exist with the Mine aria-label.)
  expect(within(board).getAllByLabelText("Mine").length).toBeGreaterThan(0);

  // Timer should stop after losing: capture current time and ensure it doesn't change.
  const timeValue = screen.getByText(/^\d+:\d{2}$/);
  const timeAtLoss = timeValue.textContent;

  // Wait long enough that, if the timer were still running, it would tick.
  await new Promise((r) => setTimeout(r, 1100));
  expect(screen.getByText(/^\d+:\d{2}$/).textContent).toBe(timeAtLoss);

  // Further interactions should be disabled (Board passes disabled when status is lost):
  // Clicking a hidden cell should not reveal it (aria-label should remain "Hidden").
  const hiddenBefore = within(board).queryAllByLabelText("Hidden").length;
  if (hiddenBefore > 0) {
    const aHiddenCell = within(board).getAllByLabelText("Hidden")[0];
    await user.click(aHiddenCell);
    const hiddenAfter = within(board).queryAllByLabelText("Hidden").length;
    expect(hiddenAfter).toBe(hiddenBefore);
  }
});
