import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const bundle = await readFile(new URL("../dist/code.js", import.meta.url), "utf8");

test("isolated UI always rebuilds from fresh source data and Refresh invalidates derived caches", () => {
  const cache = new Map(), factories = new Map(), handlers = new Map(), channelHandlers = new Map();
  const scheduled = [];
  let html = "", batches = [], collectionCalls = 0, renderFn = null, rendered = null;
  const collectionBypasses = [], navigations = [];
  const entries = Array.from({ length: 18 }, (_, i) => ({
    score: i === 0 ? "90" : 0, status: i < 5 ? "COMPLETED" : "PLANNING", progress: i < 5 ? 12 : 0,
    completedAt: i < 5 ? { year: 2026, month: 9, day: 10 } : null,
    media: { id: i + 1, type: "ANIME", episodes: 12, title: { userPreferred: `Anime ${i + 1}` }, genres: ["Action"], meanScore: i === 5 ? 84 : null }
  }));
  cache.set("settings-v1", { period: "all-time" });
  const state = (value) => ({ get: () => value, set: (next) => { value = next; } });
  const renderNow = () => { if (renderFn) { rendered = renderFn(); assert.ok(rendered); } };
  const components = new Proxy({}, { get: (_, key) => {
    if (key === "render") return (fn) => { renderFn = fn; renderNow(); };
    if (key === "update") return renderNow;
    if (["close", "onOpen", "onClose"].includes(key)) return () => {};
    return (...args) => ({ type: key, args });
  } });
  const ctx = {
    state, fieldRef: (value) => ({ current: value, onValueChange() {}, setValue(next) { this.current = next; } }),
    setTimeout: (fn) => { scheduled.push(fn); return () => {}; },
    eventHandler: (id, fn) => { handlers.set(id, fn); return id; }, newTray: () => components,
    newWebview: () => ({ setContent(fn) { this.content = fn; }, update() { html = this.content(); }, show() {}, hide() {}, onUnmount() {}, channel: { on(event, fn) { channelHandlers.set(event, fn); } } }),
    screen: { navigateTo: (path, params) => navigations.push({ path, params }) },
    continuity: { getWatchHistory: () => ({}) }, toast: { warning() {}, info() {}, error(message) { throw new Error(message); } }
  };
  const runtimeGlobals = {
    console,
    $shared: { define: (key, fn) => factories.set(key, fn), use: (key) => factories.get(key)() },
    $storage: { get: (key) => cache.get(key), set: (key, value) => cache.set(key, value), remove: (key) => cache.delete(key) },
    $anilist: {
      getRawAnimeCollection: (bypassCache) => { collectionCalls++; collectionBypasses.push(bypassCache); return { MediaListCollection: { lists: [{ entries }] } }; },
      getAnimeDetails: () => ({ studios: { nodes: [] } }),
      getAnimeCollectionWithRelations: () => { throw new Error("Unneeded relation request"); },
      customQuery: ({ variables }, token) => {
        assert.equal(token, "");
        batches.push([...variables.ids]);
        return { Page: { media: variables.ids.map((id) => ({ id, meanScore: id === 7 ? null : 84 })) } };
      }
    }
  };
  runtimeGlobals.$ui = {
    register: (fn) => runInNewContext(`(${fn.toString()})(ctx)`, { ...runtimeGlobals, ctx })
  };
  assert.doesNotThrow(() => runInNewContext(bundle + "\ninit();", runtimeGlobals));
  assert.equal(collectionCalls, 0, "opening the tray must not load data");
  handlers.get("seanime-wrapped-start")();
  handlers.get("seanime-wrapped-start")();
  assert.match(JSON.stringify(rendered), /Reading your anime library/);
  assert.match(JSON.stringify(rendered), /Preparing Wrapped/);
  assert.equal(scheduled.length, 1, "a second Start action must not queue another generation while loading");
  assert.equal(collectionCalls, 0, "the loading drawer must render before collection work starts");
  while (scheduled.length) scheduled.shift()();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 9);
  assert.ok(!batches[0].includes(6), "already known ratings must not be fetched");
  const session = cache.get("last-session-v1");
  assert.equal(session.averageScore, 9);
  assert.equal(session.recommendations.length, 10);
  assert.equal(session.recommendations.find((m) => m.mediaId === 7).globalScore, null);
  assert.ok(session.recommendations.filter((m) => m.mediaId !== 7).every((m) => m.globalScore === 84));
  assert.deepEqual(collectionBypasses, [true]);
  assert.ok(html.includes('"globalScore":84'));

  const initialRevision = cache.get("source-revision-v1");
  entries[0].score = "70";
  handlers.get("seanime-wrapped-start")();
  while (scheduled.length) scheduled.shift()();
  assert.equal(collectionCalls, 2);
  assert.deepEqual(collectionBypasses, [true, true]);
  assert.equal(cache.get("last-session-v1").averageScore, 7, "a score-only edit must be recalculated");
  assert.notEqual(cache.get("source-revision-v1"), initialRevision);
  assert.equal(batches.length, 1, "known null ratings and successful ratings should both be cached");

  entries[17] = {
    ...entries[17], score: "80", status: "COMPLETED", progress: 12,
    completedAt: { year: 2026, month: 9, day: 27 }
  };
  handlers.get("seanime-wrapped-refresh")();
  assert.equal(cache.has("last-session-v1"), false, "manual refresh must invalidate the prior Wrapped session immediately");
  assert.equal(cache.has("source-revision-v1"), false, "manual refresh must invalidate the prior source revision");
  assert.equal(scheduled.length, 1, "manual refresh must immediately start generation");
  while (scheduled.length) scheduled.shift()();
  const refreshed = cache.get("last-session-v1");
  assert.equal(collectionCalls, 3);
  assert.deepEqual(collectionBypasses, [true, true, true]);
  assert.equal(refreshed.watched.length, 6);
  assert.equal(refreshed.completed.length, 6);
  assert.equal(refreshed.averageScore, 7.5);
  assert.equal(refreshed.topFive[0].mediaId, 18);
  assert.ok(!refreshed.topFive.some((item) => item.mediaId === 5));
  assert.equal(refreshed.highestRated.mediaId, refreshed.topFive[0].mediaId);
  assert.ok(refreshed.recommendations.some((item) => item.sourceMediaId === 18));
  assert.ok(!refreshed.recommendations.some((item) => item.sourceMediaId === 5));
  assert.equal(batches.length, 2, "manual refresh must invalidate recommendation rating enrichment");

  channelHandlers.get("open-anime")({ mediaId: 12 });
  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].path, "/entry");
  assert.equal(navigations[0].params.id, "12");
});
