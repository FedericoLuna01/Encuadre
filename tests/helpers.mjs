export async function waitUntil(check, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    let timer
    const result = await Promise.race([
      Promise.resolve().then(check),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Condition check did not finish within ${timeout} ms`)), Math.max(1, deadline - Date.now())) }),
    ]).finally(() => clearTimeout(timer))
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Condition did not become true within ${timeout} ms`)
}
