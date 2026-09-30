import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createViewer } from "../src/viewer.ts";

const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const viewerSource = await readFile(new URL("../src/viewer.ts", import.meta.url), "utf8");
const domainSource = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
const bundle = await readFile(new URL("../dist/code.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

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

test("marketplace, viewer, and tray keep independent icon assignments", async () => {
  const trayPng = "https://raw.githubusercontent.com/DefnoJae/Seanime-Wrapped/main/assets/icon.png";
  const marketplacePng = "https://raw.githubusercontent.com/DefnoJae/Seanime-Wrapped/main/assets/marketplace-icon.png";
  assert.equal(manifest.icon, marketplacePng);
  assert.notEqual(manifest.icon, trayPng);
  assert.match(indexSource, new RegExp(`const trayIconUrl = "${trayPng.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(indexSource, /newTray\(\{ iconUrl: trayIconUrl/);
  assert.match(indexSource, /tray\.img\(trayIconUrl/);
  assert.ok((await stat(new URL("../assets/icon.png", import.meta.url))).size > 0);
  const marketplaceIconUrl = new URL("../assets/marketplace-icon.png", import.meta.url);
  assert.ok((await stat(marketplaceIconUrl)).size > 0);
  assert.deepEqual([...((await readFile(marketplaceIconUrl)).subarray(0, 8))], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(viewerSource, /<span class="logo" aria-hidden="true"><i><\/i><i><\/i><i><\/i><i><\/i><\/span>/);
  assert.doesNotMatch(viewerSource, /icon\.png|brand-icon|WRAPPED_ICON_URL/);
  assert.doesNotMatch(indexSource + viewerSource, /WRAPPED_ICON_URL|data:image\/png;base64/i);
});

test("every generation bypasses stale collection data and manual refresh starts immediately", () => {
  assert.match(indexSource, /getRawAnimeCollection\(true\)/);
  assert.doesNotMatch(indexSource, /getRawAnimeCollection\(forceRefresh\)/);
  assert.match(indexSource, /SOURCE_REVISION_KEY = "source-revision-v1"/);
  assert.match(indexSource, /SOURCE_SNAPSHOT_KEY = "source-snapshot-v1"/);
  assert.match(indexSource, /sourceRevision !== previousRevision/);
  assert.match(indexSource, /domain\.buildSourceSnapshot\(all, previousSnapshot, listActivities, generationNow\)/);
  assert.match(indexSource, /\$storage\.remove\(SOURCE_REVISION_KEY\)/);
  const refresh = indexSource.match(/const refreshHandler = ctx\.eventHandler\("seanime-wrapped-refresh", \(\) => \{([\s\S]*?)\n    \}\);/)?.[1] || "";
  assert.ok(refresh);
  assert.match(refresh, /\$storage\.remove\(LAST_SESSION_KEY\)/);
  assert.match(refresh, /startWrapped\(\)/);
  assert.doesNotMatch(indexSource, /Refresh queued|refreshQueued/);
});

test("generation drawer shows staged progress and disables duplicate starts", () => {
  for (const stage of ["Reading your anime library", "Calculating your stats", "Building your Top 5", "Finding what you might watch next", "Preparing your Wrapped"]) {
    assert.match(indexSource, new RegExp(stage));
  }
  assert.match(indexSource, /if \(loading\.get\(\)\) return/);
  assert.match(indexSource, /disabled: loading\.get\(\)/);
  assert.match(indexSource, /sw-loading-fill/);
});

test("plugin-owned source and build paths contain no audio feature code", async () => {
  const buildSource = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const packageSource = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const owned = indexSource + viewerSource + domainSource + buildSource + packageSource;
  assert.doesNotMatch(owned, /audioSource|audioLabel|soundtrack|toggleMute|setupAudio|new Audio|audioRegistry|volumeRef/i);
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

test("close path cancels frames and removes listeners", () => {
  assert.match(viewerSource, /cancelAnimationFrame\(raf\)/);
  assert.match(viewerSource, /removeEventListener\('keydown'/);
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
    settings: { period: "all-time", includeWatched: true, includeCompleted: true, includeRatings: true, recommendations: true, autoAdvance: false }
  });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script[1]));
});

test("both winner views have explicit gold styling and large headings have safe line boxes", () => {
  assert.match(viewerSource, /m\.rank===1\?'winner-card'/);
  assert.match(viewerSource, /\.overview-card\.winner-card\{[^}]*border:2px solid #FFD76A/);
  assert.match(viewerSource, /\.winner \.rank-number\{color:#FFD76A/);
  assert.match(viewerSource, /\.display,\.mega,\.genre-name,\.rank-number,\.rank-title,\.spotlight-title,\.studio-name,\.final h1\{line-height:1\.12;[^}]*overflow:visible/);
  assert.doesNotMatch(viewerSource, /line-height:\.(?:7\d*|8\d*)(?:;|\})/);
});

test("silent viewer has no sound controls and uses only SVG control icons", () => {
  const emptySession = {
    version: 1, generatedAt: new Date(0).toISOString(),
    period: { key: "month", label: "September 2026", context: "this month", start: 0, end: 1 },
    accuracyNote: "", watched: [], completed: [], topFive: [], highestRated: null, highestRatedStudio: null, genres: [], topStudio: null,
    averageScore: null, activeDay: null, recommendations: [], heroArt: ["data:image/svg+xml,%3Csvg/%3E"],
    summary: [], enabled: { watched: true, completed: true, ratings: true, recommendations: true }
  };
  const html = createViewer().documentFor({
    session: emptySession,
    settings: { period: "month", includeWatched: true, includeCompleted: true, includeRatings: true, recommendations: true, autoAdvance: false }
  });
  assert.doesNotMatch(html, /id="mute"|soundPrompt|soundtrack/i);
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
  assert.match(viewerSource, /data-media-id="'\+m\.mediaId\+'/);
  assert.match(viewerSource, /openingAnime=true;paused=true;updatePause\(\);window\.webview\?\.send\('open-anime',\{mediaId\}\)/);
  assert.doesNotMatch(viewerSource, /card\.dataset\.mediaId[\s\S]{0,180}closed=true/);
  assert.match(indexSource, /viewer\.channel\.on\("open-anime"/);
  assert.match(indexSource, /ctx\.screen\.navigateTo\("\/entry", \{ id: String\(mediaId\) \}\)/);
  const navigation = indexSource.slice(indexSource.indexOf('viewer.channel.on("open-anime"'), indexSource.indexOf("viewer.onUnmount"));
  assert.ok(navigation.indexOf("viewer.hide()") < navigation.indexOf("ctx.setTimeout"));
  assert.ok(navigation.indexOf("ctx.setTimeout") < navigation.indexOf('ctx.screen.navigateTo("/entry"'));
  assert.match(navigation, /catch \(cause\)[\s\S]*viewer\.show\(\)/);
});

test("no social-story features remain", () => {
  assert.doesNotMatch(indexSource + viewerSource, /friends|followers|replies|likes|profile rings/i);
});
