import { useState } from "react";
import Inicio from "./pages/Inicio";
import Login from "./pages/Login";

function App() {
  const [mostrarLogin, setMostrarLogin] = useState(false);

  return mostrarLogin ? <Login /> : <Inicio onIngresar={() => setMostrarLogin(true)} />;
}

export default App;