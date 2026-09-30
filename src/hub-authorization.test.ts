import { expect, it } from "vitest";
import { allowedHubRedirect } from "./hub-authorization";
it("accepts only the configured Hub callback and preserves code/state", () => {
  expect(allowedHubRedirect("https://hub.example/oauth/day/callback?code=abc&state=xyz", "https://hub.example"))
    .toBe("https://hub.example/oauth/day/callback?code=abc&state=xyz");
  for (const bad of ["https://evil.example/oauth/day/callback", "https://hub.example/elsewhere", "https://hub.example/oauth/day/callback#token", "https://user:pass@hub.example/oauth/day/callback"])
    expect(() => allowedHubRedirect(bad, "https://hub.example")).toThrow();
  expect(() => allowedHubRedirect("http://hub.example/oauth/day/callback", "http://hub.example")).toThrow();
});
