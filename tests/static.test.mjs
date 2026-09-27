import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createViewer } from "../src/viewer.ts";

const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const viewerSource = await readFile(new URL("../src/viewer.ts", import.meta.url), "utf8");
const bundle = await readFile(new URL("../dist/code.js", import.meta.url), "utf8");

test("tray open is free of AniList collection calls", () => {
  const handler = indexSource.match(/tray\.onOpen\(\(\) => \{([\s\S]*?)\}\);/)?.[1] || "";
  assert.ok(handler);
  assert.doesNotMatch(handler, /\$anilist|collectMetadata|startWrapped/);
});

test("viewer navigation contains no fetch or network API", () => {
  assert.doesNotMatch(viewerSource, /\bfetch\s*\(/);
  assert.doesNotMatch(viewerSource, /XMLHttpRequest|WebSocket/);
  assert.match(viewerSource, /primeWindow\(0\)\.then/);
});

test("artwork preload is slide-scoped with a two-slide look-ahead", () => {
  assert.match(viewerSource, /MAX_PRELOAD_AHEAD=2/);
  assert.match(viewerSource, /querySelectorAll\('img\[data-src\]'\)/);
  assert.match(viewerSource, /for\(let offset=0;offset<=MAX_PRELOAD_AHEAD;offset\+\+\)/);
  assert.doesNotMatch(viewerSource, /S\.watched\.map\(m=>m\.cover\)/);
  assert.doesNotMatch(viewerSource, /S\.completed\.map\(m=>m\.cover\)/);
});

test("tray requests Seanime's drawer presentation", () => {
  assert.match(indexSource, /newTray\(\{[^}]*isDrawer:\s*true/);
});

test("Top 5 reveal order is reversed to #5 through #1", () => {
  assert.match(viewerSource, /S\.topFive\.slice\(\)\.reverse\(\)\.forEach/);
  assert.match(viewerSource, /m\.rank===1\?'winner'/);
});

test("close path cancels frames, removes listeners, and destroys audio", () => {
  assert.match(viewerSource, /cancelAnimationFrame\(raf\)/);
  assert.match(viewerSource, /removeEventListener\('keydown'/);
  assert.match(viewerSource, /audio\.pause\(\)/);
  assert.match(viewerSource, /audio\.removeAttribute\('src'\)/);
  assert.match(viewerSource, /window\.webview\?\.send\('close'/);
});

test("built payload is self-contained and exposes init", () => {
  assert.match(bundle, /function init\(\)/);
  assert.doesNotMatch(bundle, /^\s*import\s/m);
  assert.doesNotMatch(bundle, /^\s*export\s/m);
});

test("generated viewer document contains syntactically valid runtime JavaScript", () => {
  const emptySession = {
    version: 1, generatedAt: new Date(0).toISOString(),
    period: { key: "all-time", label: "All Time", context: "across your anime journey", start: null, end: 0 },
    accuracyNote: "", watched: [], completed: [], topFive: [], highestRated: null, highestRatedStudio: null, genres: [], topStudio: null,
    averageScore: null, activeDay: null, recommendations: [], heroArt: ["data:image/svg+xml,%3Csvg/%3E"],
    summary: [], enabled: { watched: true, completed: true, ratings: true, recommendations: true }
  };
  const html = createViewer().documentFor({
    session: emptySession,
    settings: { period: "all-time", includeWatched: true, includeCompleted: true, includeRatings: true, recommendations: true, soundtrack: "Off", volume: 30, autoAdvance: false },
    audioSource: "", audioLabel: ""
  });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script[1]));
});

test("no social-story features remain", () => {
  assert.doesNotMatch(indexSource + viewerSource, /friends|followers|replies|likes|profile rings/i);
});
