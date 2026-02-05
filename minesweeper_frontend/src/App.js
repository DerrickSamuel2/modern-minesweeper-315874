import React from "react";
import "./App.css";
import Game from "./components/Game/Game";

// PUBLIC_INTERFACE
function App() {
  /** Root application component. */
  return (
    <div className="App">
      <Game />
    </div>
  );
}

export default App;
