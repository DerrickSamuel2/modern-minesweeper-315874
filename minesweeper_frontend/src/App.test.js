import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders minesweeper title", () => {
  render(<App />);
  expect(screen.getByText(/minesweeper/i)).toBeInTheDocument();
});
