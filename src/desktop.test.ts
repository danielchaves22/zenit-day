import { describe, expect, it } from "vitest";
import { saveCapture } from "./desktop";
import { Repository, type Persistence, type Stored } from "./storage";
import { blankDoc, emptyWorkspace, enqueue } from "./model";
const user = "11111111-1111-4111-8111-111111111111";
function disk(): Persistence & { fail: boolean } {
  let stored: Stored = { version: 0, data: emptyWorkspace() };
  return {
    fail: false,
    async read() {
      return structuredClone(stored);
    },
    async write(_key, expected, data) {
      if (this.fail) throw new Error("disk full");
      if (expected !== stored.version) throw new Error("stale");
      stored = { version: expected + 1, data: structuredClone(data) };
      return stored.version;
    },
  } satisfies Persistence & { fail: boolean };
}
describe("desktop capture uses the main writer", () => {
  it("serializes rapid retries with a main-window edit and persists one capture offline", async () => {
    const storage = disk();
    const repo = await new Repository("account-a", storage).load();
    const id = crypto.randomUUID(),
      other = crypto.randomUUID();
    const request = {
      namespace: repo.key,
      id,
      title: "  Anotar retorno  ",
      priority: "urgent" as const,
    };
    await Promise.all([
      saveCapture(repo, user, request),
      repo.mutate((w) => enqueue(w, user, other, blankDoc("Outro assunto"))),
      saveCapture(repo, user, request),
    ]);
    const restored = await new Repository(repo.key, storage).load();
    expect(Object.keys(restored.current.subjects)).toHaveLength(2);
    expect(restored.current.queue).toHaveLength(2);
    expect(restored.current.subjects[id]).toMatchObject({
      title: "Anotar retorno",
      project: null,
      subgroup: null,
      status: "todo",
      priority: "urgent",
    });
  });
  it("rejects a stale capture from another account before any write", async () => {
    const repo = await new Repository("account-b", disk()).load();
    await expect(
      saveCapture(repo, user, {
        namespace: "account-a",
        id: crypto.randomUUID(),
        title: "Privado",
      }),
    ).rejects.toThrow("conta mudou");
    expect(repo.current.queue).toHaveLength(0);
  });
  it("does not confirm a failed local save and can retry it", async () => {
    const storage = disk();
    const repo = await new Repository("account-a", storage).load();
    const request = {
      namespace: repo.key,
      id: crypto.randomUUID(),
      title: "Salvar offline",
    };
    storage.fail = true;
    await expect(saveCapture(repo, user, request)).rejects.toThrow("disk full");
    expect(repo.current.queue).toHaveLength(0);
    storage.fail = false;
    await saveCapture(repo, user, request);
    expect(repo.current.queue).toHaveLength(1);
    await expect(
      saveCapture(repo, user, { ...request, priority: "low" }),
    ).rejects.toThrow("já foi salvo");
  });
  it("does not overwrite a captured subject when a retry carries different text", async () => {
    const repo = await new Repository("account-a", disk()).load();
    const request = {
      namespace: repo.key,
      id: crypto.randomUUID(),
      title: "Original",
    };
    await saveCapture(repo, user, request);
    await expect(
      saveCapture(repo, user, { ...request, title: "Outro texto" }),
    ).rejects.toThrow("já foi salvo");
    expect(repo.current.subjects[request.id].title).toBe("Original");
    expect(repo.current.queue).toHaveLength(1);
  });
});
