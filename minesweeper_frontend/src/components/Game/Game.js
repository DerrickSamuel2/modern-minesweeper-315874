import React, { useMemo, useState } from "react";
import { useMinesweeperGame } from "../../hooks/useMinesweeperGame";
import Board from "../Board/Board";

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// PUBLIC_INTERFACE
export default function Game() {
  /** Main game container with controls and header. */
  const [difficulty, setDifficulty] = useState("beginner");

  const config = useMemo(() => {
    switch (difficulty) {
      case "intermediate":
        return { rows: 16, cols: 16, mines: 40 };
      case "expert":
        return { rows: 16, cols: 30, mines: 99 };
      case "beginner":
      default:
        return { rows: 9, cols: 9, mines: 10 };
    }
  }, [difficulty]);

  const game = useMinesweeperGame(config);

  const statusLabel = useMemo(() => {
    if (game.status === "ready") return "Ready";
    if (game.status === "playing") return "In progress";
    if (game.status === "won") return "You win";
    if (game.status === "lost") return "Game over";
    return game.status;
  }, [game.status]);

  return (
    <main className="ms-page">
      <section className="ms-shell" aria-label="Minesweeper">
        <header className="ms-header">
          <div className="ms-titleblock">
            <h1 className="ms-title">Minesweeper</h1>
            <p className="ms-subtitle">Rose Gold Edition</p>
          </div>

          <div className="ms-stats" role="status" aria-live="polite">
            <div className="ms-stat">
              <div className="ms-stat-label">Mines</div>
              <div className="ms-stat-value">{game.minesRemaining}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">Time</div>
              <div className="ms-stat-value">{formatTime(game.secondsElapsed)}</div>
            </div>
            <div className="ms-stat ms-stat-status">
              <div className="ms-stat-label">Status</div>
              <div
                className={[
                  "ms-stat-value",
                  game.status === "won" ? "is-success" : "",
                  game.status === "lost" ? "is-error" : "",
                ].join(" ")}
              >
                {statusLabel}
              </div>
            </div>
          </div>
        </header>

        <div className="ms-controls" aria-label="Game controls">
          <div className="ms-control-group">
            <button
              type="button"
              className="ms-btn ms-btn-primary"
              onClick={game.actions.reset}
            >
              Reset
            </button>

            <button
              type="button"
              className={["ms-btn", game.flagMode ? "ms-btn-secondary" : "ms-btn-ghost"].join(
                " "
              )}
              onClick={game.actions.toggleFlagMode}
              aria-pressed={game.flagMode}
              title="When enabled, left click places flags instead of revealing"
            >
              Flag mode: {game.flagMode ? "On" : "Off"}
            </button>
          </div>

          <div className="ms-control-group">
            <label className="ms-select-label" htmlFor="difficulty">
              Difficulty
            </label>
            <select
              id="difficulty"
              className="ms-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="beginner">Beginner (9×9, 10)</option>
              <option value="intermediate">Intermediate (16×16, 40)</option>
              <option value="expert">Expert (16×30, 99)</option>
            </select>
          </div>
        </div>

        <div className="ms-boardwrap">
          <Board
            grid={game.grid}
            status={game.status}
            onReveal={(r, c) => game.actions.revealOrFlag(r, c, "reveal")}
            onFlag={(r, c) => game.actions.revealOrFlag(r, c, "flag")}
          />
        </div>

        <footer className="ms-hint">
          <div className="ms-hint-row">
            <span className="ms-pill">Left click</span> reveal
            <span className="ms-dot" />
            <span className="ms-pill">Right click</span> flag
            <span className="ms-dot" />
            First click is always safe.
          </div>
        </footer>
      </section>
    </main>
  );
}
