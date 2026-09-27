import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createViewer } from "../src/viewer.ts";

const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const viewerSource = await readFile(new URL("../src/viewer.ts", import.meta.url), "utf8");
const domainSource = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
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

test("Goja runtime formatting avoids locale-dependent date APIs", () => {
  assert.doesNotMatch(indexSource + viewerSource + domainSource, /toLocale(?:String|DateString|TimeString)/);
});

test("webview keyboard controls explicitly focus and listen during capture", () => {
  assert.match(viewerSource, /<main id="app" tabindex="-1"/);
  assert.match(viewerSource, /window\.focus\(\)/);
  assert.match(viewerSource, /app\.focus\(\{preventScroll:true\}\)/);
  assert.match(viewerSource, /document\.addEventListener\('keydown',onKey,true\)/);
  assert.match(viewerSource, /handledKeys=new WeakSet\(\)/);
  assert.match(viewerSource, /e\.key==='ArrowRight'/);
  assert.match(viewerSource, /e\.key==='ArrowLeft'/);
  assert.match(viewerSource, /e\.key==='Escape'/);
  assert.match(viewerSource, /e\.code==='Space'/);
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

test("public builds show a truthful no-soundtrack state", () => {
  assert.match(indexSource, /No local soundtracks installed/);
  assert.match(indexSource, /soundtrack\.source \? settings : \{ \.\.\.settings, soundtrack: "Off" as const \}/);
  assert.match(indexSource, /Object\.keys\(audioRegistry\)\.filter/);
});

test("every Seanime UI render callback returns its root component", () => {
  const renderCallbacks = [...indexSource.matchAll(/([A-Za-z_$][\w$]*)\.render\(\(\) => \{/g)];
  assert.equal(renderCallbacks.length, 1);
  for (const callback of renderCallbacks) {
    const owner = callback[1];
    const body = indexSource.slice(callback.index, indexSource.indexOf(`${owner}.onOpen`, callback.index));
    assert.match(body, new RegExp(`return\\s+${owner}\\.[A-Za-z_$][\\w$]*\\(`));
  }
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

test("silent viewer hides soundtrack control and uses only SVG control icons", () => {
  const emptySession = {
    version: 1, generatedAt: new Date(0).toISOString(),
    period: { key: "month", label: "September 2026", context: "this month", start: 0, end: 1 },
    accuracyNote: "", watched: [], completed: [], topFive: [], highestRated: null, highestRatedStudio: null, genres: [], topStudio: null,
    averageScore: null, activeDay: null, recommendations: [], heroArt: ["data:image/svg+xml,%3Csvg/%3E"],
    summary: [], enabled: { watched: true, completed: true, ratings: true, recommendations: true }
  };
  const html = createViewer().documentFor({
    session: emptySession,
    settings: { period: "month", includeWatched: true, includeCompleted: true, includeRatings: true, recommendations: true, soundtrack: "Off", volume: 30, autoAdvance: false },
    audioSource: "", audioLabel: ""
  });
  assert.match(html, /<button id="mute"[^>]* hidden>/);
  assert.equal((html.match(/id="close"/g) || []).length, 1);
  assert.doesNotMatch(html, />[×♪♩Ⅱ▶]</);
});

test("completed shuffle duration scales with shown titles and is capped", () => {
  const viewer = createViewer();
  assert.equal(viewer.completedSlideDuration(1), 6000);
  assert.equal(viewer.completedSlideDuration(3), 9000);
  assert.equal(viewer.completedSlideDuration(4), 12000);
  assert.equal(viewer.completedSlideDuration(100), 18000);
  assert.match(viewerSource, /shuffleCompleted\(root,cycle\)/);
});

test("recommendations retain ten portrait-ready cards with visible ratings", () => {
  assert.match(viewerSource, /\.rec-card\{aspect-ratio:2\/3/);
  assert.match(viewerSource, /grid-template-columns:repeat\(5,minmax\(120px,180px\)\)/);
  assert.match(viewerSource, /class="rec-rating">★ /);
  assert.match(viewerSource, /m\.globalScore\/10/);
});

test("no social-story features remain", () => {
  assert.doesNotMatch(indexSource + viewerSource, /friends|followers|replies|likes|profile rings/i);
});
