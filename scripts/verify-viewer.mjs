// Optional browser regression: node scripts/verify-viewer.mjs [Playwright package path]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { createDomain } from "../src/domain.ts";
import { createViewer } from "../src/viewer.ts";
const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const now = new Date(2026, 8, 27, 12).getTime();
const art = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#624181"/><circle cx="380" cy="240" r="200" fill="#df82bf"/></svg>');
const settings = { period: "month", includeWatched: true, includeCompleted: true, includeRatings: true, recommendations: true, autoAdvance: false };
const entries = Array.from({ length: 15 }, (_, i) => ({
  score: i < 5 ? String(95 - i * 5) : 0, status: i < 5 ? "COMPLETED" : "PLANNING", progress: i < 5 ? 24 : 0,
  completedAt: i < 5 ? { year: 2026, month: 9, day: 10 } : null,
  media: { id: i + 1, type: "ANIME", title: { userPreferred: ["Anime", "September", "Genre", "Score"][i % 4] }, episodes: 24, genres: ["Action"], meanScore: 84, coverImage: { large: art }, bannerImage: art }
}));
const domain = createDomain();
const session = domain.buildSession(domain.normalizeCollection({ MediaListCollection: { lists: [{ entries }] } }, {}), {}, [], settings, now);
const html = createViewer().documentFor({ session, settings });
const errors = [];
try {
  for (const [width, height] of [[1440, 900], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http**/*", (route) => route.abort());
    await page.setContent(html);
    await page.locator(".loading.hidden").waitFor();
    assert.equal(await page.locator("#app").evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator(".brand .logo i").count(), 4);
    assert.equal(await page.locator("#mute").count(), 0);
    const seen = [];
    const ranks = [];
    for (let i = 0; i < 20; i++) {
      const active = page.locator("#stage > .slide.active");
      const kind = await active.getAttribute("class");
      seen.push(kind);
      if (/\brank\b/.test(kind)) ranks.push((await active.locator(".rank-number").textContent()).trim());
      const clipped = await active.locator(".display,.genre-name,.rank-title,.rank-number,.spotlight-title,.mega").evaluateAll((elements) => elements.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth || el.scrollHeight > el.clientHeight + 2;
      }).map((el) => ({ text:el.textContent, rect:el.getBoundingClientRect().toJSON(), scrollHeight:el.scrollHeight, clientHeight:el.clientHeight })));
      assert.deepEqual(clipped, [], `${width}×${height} clipped ${kind}`);
      if (kind.includes("overview")) {
        const winner = active.locator(".winner-card");
        assert.equal(await winner.count(), 1);
        assert.equal(await winner.evaluate((el) => getComputedStyle(el).borderTopColor), "rgb(255, 215, 106)");
        assert.match(await winner.textContent(), /Your score ★ 9\.5/);
      }
      if (/\brank\b/.test(kind) && kind.includes("winner")) assert.equal(await active.locator(".rank-number").evaluate((el) => getComputedStyle(el).color), "rgb(255, 215, 106)");
      if (kind.includes("recommend")) {
        const heading = await active.locator(".recommend-head").boundingBox();
        const chrome = await page.locator(".chrome").boundingBox();
        assert.ok(heading.y >= chrome.y + chrome.height, "recommendation heading must clear toolbar");
        assert.equal(await active.locator(".rec-card").count(), 10);
        assert.equal(await active.locator(".rec-rating").first().textContent(), "★ 8.4 AniList");
        const boxes = await active.locator(".rec-card").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w:r.width,h:r.height,b:r.bottom }; }));
        assert.ok(boxes.every((r) => Math.abs(r.w / r.h - 2/3) < .02 && r.b < height));
      }
      if (process.argv[3] && (kind.includes("intro") || kind.includes("overview") || kind.includes("recommend"))) {
        await mkdir(process.argv[3], { recursive: true });
        await page.screenshot({ path: `${process.argv[3]}/${width}-${kind.split(" ")[1]}.png` });
      }
      if (kind === "slide final active") break;
      await page.keyboard.press("ArrowRight");
    }
    assert.deepEqual(ranks, ["#5", "#4", "#3", "#2", "#1"]);
    await page.keyboard.press("ArrowLeft");
    assert.ok(!(await page.locator(".slide.active").getAttribute("class")).includes("slide final"));
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#pause").getAttribute("aria-label"), "Pause auto-advance");
    await page.keyboard.press("Escape");
    assert.match(await page.locator("#app").getAttribute("class"), /closing/);
    console.log(`${width}×${height}: checked ${seen.length} slides, typography, gold winner, ratings, portrait grid and keyboard controls`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
