# Seanime Wrapped

Seanime Wrapped is a desktop-first, cinematic personal anime recap for [Seanime](https://github.com/5rahim/seanime). Open its tray, choose a period and playback options, then generate one complete session that plays as a full-screen story with no network work during slide navigation.

## What it includes

- Instant native Seanime tray; opening it does not read AniList or prepare media
- This month, previous month, last 3/6 months, year to date, previous full year, and all-time periods
- Watched and completed counts, genre breakdown, Top 5, a dedicated #1 spotlight, studio affinity, average user score, defensible weekday activity, recommendations, and final summary
- Top 5 reveals in the order **#5 → #4 → #3 → #2 → #1**, followed by an overview
- Up to 10 recommendation cards in a 5 × 2 desktop layout; selecting a card opens that anime inside Seanime
- Slide-scoped artwork loading with a small look-ahead buffer, segmented progress, click/keyboard navigation, pause/resume, reduced-motion support, and deterministic cleanup
- Immediate staged generation feedback in the drawer while library, statistics, Top 5, and recommendations are prepared
- A silent viewer with no media playback or external streaming dependency

## Requirements

- Seanime **3.10.2 or newer** (`$shared`, current storage, tray, continuity, and webview APIs)
- Node.js 20+ for development/builds
- An AniList-connected or populated local Seanime anime collection

The implementation and committed declarations were checked against the upstream Seanime v3.10.3 source and `internal/extension_repo/goja_plugin_types`.

## Install

In Seanime, add this manifest URL as an extension:

```text
https://raw.githubusercontent.com/DefnoJae/Seanime-Wrapped/main/manifest.json
```

Grant the requested `anilist` and `storage` permissions. The plugin does not request an AniList token, unrestricted network access, filesystem access, command execution, DOM-script manipulation, or social permissions.

## Use

1. Open the Seanime Wrapped icon in the plugin tray.
2. Select a time period, included sections, and auto-advance.
3. Press **Start Wrapped**. Data collection and metadata enrichment begin only now.
4. Navigate with left/right clicks, `Arrow Left`, or `Arrow Right`. Press `Space` to pause/resume and `Escape` to close.

**Refresh Data** only queues invalidation. It clears this plugin's long-lived metadata/session cache immediately, then requests a fresh Seanime/AniList collection the next time **Start Wrapped** is pressed. It does not make a request while browsing the tray.

## Development

```bash
npm install
npm run check
```

Commands:

- `npm run typecheck` checks against the vendored current Seanime declarations.
- `npm test` verifies ranking, period accuracy, recommendations, request boundaries, viewer cleanup, and the built payload.
- `npm run build` regenerates `dist/code.js`.
- `npm run check` runs type checking, tests, and a production build.

For local Seanime development, point a local copy of `manifest.json` at the absolute `dist/code.js` path and set `isDevelopment: true`. Do not commit that local manifest edit.

## Architecture

The runtime is divided into three self-contained factories because Seanime runs `$ui.register` in an isolated Goja runtime:

1. `src/domain.ts` — collection normalization, period boundaries, ranking, statistics, studio aggregation, recommendations, and the immutable session model
2. `src/viewer.ts` — self-contained iframe document, slide compositions, artwork preload, animation, navigation, and cleanup
3. `src/index.ts` — native tray wiring, staged generation UI, persisted settings/cache, deferred Seanime API calls, metadata enrichment, and webview lifecycle

`$shared.define`/`$shared.use` safely instantiates the pure factories inside the UI runtime. The build concatenates and transpiles them into the single JavaScript payload Seanime expects.

### Request and cache boundary

```text
Open tray
  └─ local settings only (zero AniList calls)

Start Wrapped
  ├─ ctx.continuity.getWatchHistory()               local
  ├─ $anilist.getRawAnimeCollection(true)            always bypass stale collection snapshots
  ├─ $anilist.customQuery(Page.activities)            bounded AniList list-activity evidence when available
  ├─ $anilist.getAnimeDetails(id)                    at most 15 prioritized IDs; long-lived plugin cache
  ├─ $anilist.getAnimeCollectionWithRelations()      only when recommendations need more candidates
  └─ $anilist.customQuery(Page.media)                one batch for final missing community ratings; 7-day cache
       └─ immutable WrappedSession + bounded slide artwork preload
            └─ slide navigation                     zero API/fetch calls
```

Every generation uses `getRawAnimeCollection(true)`, then compares a deterministic revision and persisted per-title snapshot of list membership, status, progress, scores, dates, and watch history before replacing the derived session. Bounded periods prioritize Seanime watch history, explicit AniList dates, and AniList list activity; observed status/progress transitions fill missing dates. A tightly limited full-completion `updatedAt` fallback is disabled when the update pattern resembles a bulk import. **Refresh Data** clears the saved session and enrichment caches, then immediately starts a fresh generation while retaining the previous source snapshot needed to recognize transitions. Metadata failures and rate limits are caught per item; current basic collection data still produces a partial Wrapped.

### Ranking algorithm

Top 5 ranking is deterministic and intentionally avoids invented period episode counts:

1. Personal AniList rating contributes 60% (`userScore / 10`). Unrated titles get no rating component.
2. Engagement contributes 40%: 85% completion ratio plus a 15% logarithmic absolute-progress bonus, both capped at 1. Unknown episode totals use the bounded logarithmic measure.
3. Latest supported watch/start/completion timestamp and media ID break ties deterministically.

Top 5 slides show personal ratings alongside progress, and the “Your Highest Rated Anime” spotlight intentionally reuses the exact #1 Top 5 record. Recommendation cards use AniList community ratings instead. Recommendations derive from the current Top 5's recommendation/relationship links, genres, and available studio metadata. Each Top 5 seed receives up to two unique ANIME-only slots, with planning titles as a fallback. Only the final ten candidates missing community scores are enriched, together in one native public GraphQL request. Successful scores and confirmed null values are cached for seven days; request failures are retried on the next session.

### Runtime score diagnostics

Seanime returns Go pointer-backed numbers that Goja exposes as boxed objects. The parser unwraps `valueOf()` before checking numbers, accepts numeric strings and the native `getScore()` getter, and rejects missing/zero/invalid values. Values above 10 use POINT_100 conversion; values 1–10 are retained for already-normalized adapters. Without score-format metadata a true POINT_100 value of 9 cannot be distinguished from a normalized 9; this compatibility policy deliberately preserves 9 as requested.

For one local debugging build, set `DEBUG_SCORES = true` in `src/index.ts`, then rebuild. Starting Wrapped logs only entry/rated counts and score field/type/range counts. It never logs titles, IDs, notes, or raw collections. Restore `false` after validation. See `docs/score-runtime.md` for source tracing and the reproduced Goja behavior.

Optional browser regression: `node scripts/verify-viewer.mjs` with Playwright and Microsoft Edge installed (or pass a Playwright package path). It checks 1440×900 and 1920×1080, text bounds, gold winner styling, the portrait recommendation grid, ratings and keyboard behavior. An optional third argument saves screenshots.

The displayed metric is explicitly labeled **episode progress**, not “episodes watched this period.”

## Historical-data limitations

Seanime continuity currently stores the latest watch-history record per media, not a complete historical episode ledger. Therefore:

- A bounded period includes a title only when its Seanime watch-history, AniList start, or AniList completion timestamp falls inside it. AniList `updatedAt` is retained for normalization but never used as evidence of watching, so bulk imports cannot flood recent counts or Top 5 eligibility. Ratings use the deduplicated watched/completed union even when count slides are disabled.
- Current progress is useful for engagement ranking but is never claimed as period-specific viewing volume.
- Completed anime require a supported AniList completion date for bounded periods.
- The active weekday slide appears only when genuine continuity timestamps exist. It describes weekdays of latest saved title records, not total episodes watched per weekday.
- Studio affinity uses available metadata for up to the 15 most engaged titles to avoid unbounded AniList requests.
- If the available evidence cannot support a section, the viewer omits it or explains the missing value instead of fabricating one.

There is deliberately no “longest binge” statistic.

## Privacy and cleanup

The generated session remains inside Seanime and plugin storage. Closing the viewer cancels animation frames, removes keyboard/click handlers, and unmounts the webview. No polling or background interval is used.

## License

No commercial artwork or music is included. Runtime anime artwork comes from the user's Seanime/AniList data. Choose a source-code license before redistributing modified builds.
