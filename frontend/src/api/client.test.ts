import { describe, expect, it, vi } from "vitest";

import { accountStore } from "../store/accounts";
import { USER } from "../test/server";
import { ApiError, request, setUnauthorizedHandler } from "./client";

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("request", () => {
  it("sends the active account's token", async () => {
    accountStore.signIn({ token: "abc", user: USER });
    const fetchMock = respond(200, { ok: true });
    await request("/api/x");
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer abc");
  });

  it("turns error responses into ApiError with the backend code and params", async () => {
    respond(413, { detail: "Too large", code: "file_too_large", params: { max_mb: 20 } });
    const error = await request("/api/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 413, code: "file_too_large", params: { max_mb: 20 } });
  });

  it("reports an unreachable server as status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(request("/api/x")).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("signs out on 401 for authenticated requests only", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(401, { detail: "Not authenticated", code: "not_authenticated" });
    await request("/api/x").catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    respond(401, { detail: "Wrong", code: "invalid_credentials" });
    await request("/api/auth/login", { auth: false }).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });
});
