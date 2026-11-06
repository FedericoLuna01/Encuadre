import { expect, it } from "vitest"
import { pageUnavailableReason } from "../src/lib/page-availability"

it("allows web pages and localhost without confusing store-like addresses", () => {
  for (const url of ["https://example.com", "http://localhost:5173", "https://chrome.google.com/webstore-other", "https://chromewebstore.google.com.example.org"]) {
    expect(pageUnavailableReason(url)).toBeUndefined()
  }
})

it("rejects internal pages, local files and both store addresses", () => {
  for (const url of [undefined, "invalid", "chrome://newtab", "about:blank", "data:text/html,test", "file:///C:/page.html", "chrome-extension://abc/result.html", "https://chromewebstore.google.com", "https://chrome.google.com/webstore/detail/example"]) {
    expect(pageUnavailableReason(url)).toBeTruthy()
  }
})
