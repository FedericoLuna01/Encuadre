import { createServer } from "vite"
import { spawn } from "node:child_process"

const tests = ["action", "permissions", "popup-native", "extension", "capture-quality", "inline", "p1", "editor", "pdf"]
const selected = process.argv.slice(2)
if (selected.some(name => !tests.includes(name))) throw new Error("Unknown browser test")
const names = selected.length ? selected : tests
let server
try {
  let origin = process.env.TEST_ORIGIN
  if (!origin && names.some(name => name === "editor" || name === "pdf")) {
    // The runner owns this temporary server and always closes it on completion.
    server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } })
    await server.listen()
    const address = server.httpServer.address()
    if (!address || typeof address === "string") throw new Error("No test server address")
    origin = `http://127.0.0.1:${address.port}`
  }
  for (const name of names) {
    console.log(`Running browser test: ${name}`)
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`tests/${name}.mjs`], { stdio: "inherit", windowsHide: true, env: { ...process.env, ...(origin ? { TEST_ORIGIN: origin } : {}) } })
      child.on("error", reject)
      child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${name}: ${signal ?? `exit ${code}`}`)))
    })
  }
} finally { await server?.close() }
