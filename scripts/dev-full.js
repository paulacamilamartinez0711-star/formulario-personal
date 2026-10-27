import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const backendPort = process.env.PORT || "3001";
const backendUrl = `http://localhost:${backendPort}/api/health`;
let backend;
let backendExit;
let backendError;
let receivedSignal;

function backendIsReady() {
  return fetch(backendUrl)
    .then((response) => response.ok)
    .catch(() => false);
}

function stop(child) {
  if (child && child.exitCode === null && !child.killed) {
    child.kill();
  }
}

async function waitForBackend() {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (backendError) throw backendError;
    if (backend.exitCode !== null) {
      throw new Error(`El backend terminó durante el inicio (código ${backend.exitCode}).`);
    }

    if (await backendIsReady()) return;

    await delay(250);
  }

  throw new Error(`El backend no respondió en ${backendUrl} dentro de 30 segundos.`);
}

async function main() {
  try {
    if (await backendIsReady()) {
      console.log("Backend ya activo.");
    } else {
      backend = spawn(process.execPath, ["backend/server.js"], { stdio: "inherit" });
      backend.on("error", (error) => {
        backendError = error;
      });
      backendExit = new Promise((resolve) => {
        backend.once("exit", (code) => resolve({ process: "backend", code }));
      });
      await waitForBackend();
    }
    console.log("Backend listo. Iniciando Vite...");

    viteProcess = spawn(
      process.execPath,
      [path.resolve("node_modules/vite/bin/vite.js"), ...process.argv.slice(2)],
      { stdio: "inherit" }
    );
    viteProcess.on("error", (error) => {
      console.error("No se pudo iniciar Vite:", error);
      stop(backend);
    });

    const viteExit = new Promise((resolve) => {
      viteProcess.once("exit", (code) => resolve({ process: "vite", code }));
    });
    const exits = backendExit ? [backendExit, viteExit] : [viteExit];
    const firstExit = await Promise.race(exits);
    stop(firstExit.process === "vite" ? backend : viteProcess);
    await Promise.all(exits);

    if (receivedSignal) {
      process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
    } else if (firstExit.process === "backend") {
      console.error("El backend terminó inesperadamente.");
      process.exitCode = 1;
    } else {
      process.exitCode = firstExit.code ?? 1;
    }
  } catch (error) {
    console.error(`No se pudo iniciar el entorno local: ${error.message}`);
    stop(viteProcess);
    stop(backend);
    process.exitCode = 1;
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    receivedSignal = signal;
    stop(viteProcess);
    stop(backend);
  });
}

let viteProcess;

main().catch((error) => {
  console.error("Error inesperado al iniciar el entorno local:", error);
  stop(viteProcess);
  stop(backend);
  process.exitCode = 1;
});
