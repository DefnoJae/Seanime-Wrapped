import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const bundle = await readFile(new URL("../dist/code.js", import.meta.url), "utf8");

test("Start batches only final missing recommendation ratings and reuses cache", () => {
  const cache = new Map(), factories = new Map(), handlers = new Map();
  let html = "", batches = [], collectionCalls = 0;
  const entries = Array.from({ length: 18 }, (_, i) => ({
    score: i === 0 ? "90" : 0, status: i === 0 ? "COMPLETED" : "PLANNING", progress: i === 0 ? 12 : 0,
    completedAt: { year: 2026, month: 9, day: 10 },
    media: { id: i + 1, episodes: 12, title: { userPreferred: `Anime ${i + 1}` }, genres: ["Action"], meanScore: i === 1 ? 84 : null }
  }));
  cache.set("settings-v1", { period: "all-time", soundtrack: "Off" });
  const state = (value) => ({ get: () => value, set: (next) => { value = next; } });
  const components = new Proxy({}, { get: (_, key) => {
    if (key === "render") return (fn) => { assert.ok(fn()); };
    if (["update", "close", "onOpen", "onClose"].includes(key)) return () => {};
    return (...args) => ({ type: key, args });
  } });
  const ctx = {
    state, fieldRef: (value) => ({ current: value, onValueChange() {}, setValue(next) { this.current = next; } }),
    eventHandler: (id, fn) => { handlers.set(id, fn); return id; }, newTray: () => components,
    newWebview: () => ({ setContent(fn) { this.content = fn; }, update() { html = this.content(); }, show() {}, hide() {}, onUnmount() {}, channel: { on() {} } }),
    continuity: { getWatchHistory: () => ({}) }, toast: { warning() {}, info() {}, error(message) { throw new Error(message); } }
  };
  runInNewContext(bundle + "\ninit();", {
    console,
    $shared: { define: (key, fn) => factories.set(key, fn), use: (key) => factories.get(key)() },
    $storage: { get: (key) => cache.get(key), set: (key, value) => cache.set(key, value), remove: (key) => cache.delete(key) },
    $ui: { register: (fn) => fn(ctx) },
    $anilist: {
      getRawAnimeCollection: () => { collectionCalls++; return { MediaListCollection: { lists: [{ entries }] } }; },
      getAnimeDetails: () => ({ studios: { nodes: [] } }),
      getAnimeCollectionWithRelations: () => { throw new Error("Unneeded relation request"); },
      customQuery: ({ variables }, token) => {
        assert.equal(token, "");
        batches.push([...variables.ids]);
        return { Page: { media: variables.ids.map((id) => ({ id, meanScore: id === 3 ? null : 84 })) } };
      }
    }
  });
  assert.equal(collectionCalls, 0, "opening the tray must not load data");
  handlers.get("seanime-wrapped-start")();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 9);
  assert.ok(!batches[0].includes(2), "already known ratings must not be fetched");
  const session = cache.get("last-session-v1");
  assert.equal(session.averageScore, 9);
  assert.equal(session.recommendations.length, 10);
  assert.equal(session.recommendations.find((m) => m.mediaId === 3).globalScore, null);
  assert.ok(session.recommendations.filter((m) => m.mediaId !== 3).every((m) => m.globalScore === 84));
  assert.ok(html.includes('"globalScore":84'));
  handlers.get("seanime-wrapped-start")();
  assert.equal(batches.length, 1, "known null ratings and successful ratings should both be cached");
});
