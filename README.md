# Seanime Wrapped

Seanime Wrapped is a desktop-first, cinematic personal anime recap for [Seanime](https://github.com/5rahim/seanime). Open its tray, choose a period and playback options, then generate one complete session that plays as a full-screen story with no network work during slide navigation.

## What it includes

- Instant native Seanime tray; opening it does not read AniList or prepare media
- This month, previous month, last 3/6 months, year to date, previous full year, and all-time periods
- Watched and completed counts, genre breakdown, Top 5, highest user-rated anime, studio affinity, average user score, defensible weekday activity, recommendations, and final summary
- Top 5 reveals in the order **#5 → #4 → #3 → #2 → #1**, followed by an overview
- Up to 10 recommendation cards in a 5 × 2 desktop layout
- Slide-scoped artwork loading with a small look-ahead buffer, segmented progress, click/keyboard navigation, pause/resume, reduced-motion support, and deterministic cleanup
- Optional, private local soundtrack embedding with continuous playback, volume, mute, fade-in, and immediate stop on close

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
2. Select a time period, included sections, soundtrack, volume, and auto-advance.
3. Press **Start Wrapped**. Data collection and metadata enrichment begin only now.
4. Navigate with left/right clicks, `Arrow Left`, or `Arrow Right`. Press `Space` to pause/resume and `Escape` to close.

**Refresh Data** only queues invalidation. It clears this plugin's long-lived metadata/session cache immediately, then requests a fresh Seanime/AniList collection the next time **Start Wrapped** is pressed. It does not make a request while browsing the tray.

## Private soundtracks

No music is included, downloaded, or streamed by this repository. Add your own legally obtained files under `assets/audio/` before building:

| Slot | Filename stem |
| --- | --- |
| Inferno | `inferno` |
| Bling-Bang-Bang-Born | `bling-bang-bang-born` |
| Otonoke | `otonoke` |
| Black Catcher | `black-catcher` |

Supported extensions are `.mp3`, `.ogg`, `.wav`, `.m4a`, and `.aac`. For example:

```text
assets/audio/inferno.mp3
assets/audio/otonoke.ogg
```

Run `npm run build`. The build converts found files to data URIs inside your local `dist/code.js`; `assets/audio/*` is ignored by Git. Do not commit a private audio-bearing bundle to a public repository. Missing selections fall back to another installed track; when none exist, Wrapped continues silently. **Random** chooses one available track once per session.

## Development

```bash
npm install
npm run check
```

Commands:

- `npm run typecheck` checks against the vendored current Seanime declarations.
- `npm test` verifies ranking, period accuracy, recommendations, request boundaries, viewer cleanup, and the built payload.
- `npm run build` regenerates the private audio registry and `dist/code.js`.
- `npm run check` runs type checking, tests, and a production build.

For local Seanime development, point a local copy of `manifest.json` at the absolute `dist/code.js` path and set `isDevelopment: true`. Do not commit that local manifest edit.

## Architecture

The runtime is divided into three self-contained factories because Seanime runs `$ui.register` in an isolated Goja runtime:

1. `src/domain.ts` — collection normalization, period boundaries, ranking, statistics, studio aggregation, recommendations, and the immutable session model
2. `src/viewer.ts` — self-contained iframe document, slide compositions, artwork preload, animation, navigation, audio, and cleanup
3. `src/index.ts` — native tray wiring, persisted settings/cache, deferred Seanime API calls, metadata enrichment, and webview lifecycle

`$shared.define`/`$shared.use` safely instantiates the pure factories inside the UI runtime. The build concatenates and transpiles them into the single JavaScript payload Seanime expects.

### Request and cache boundary

```text
Open tray
  └─ local settings only (zero AniList calls)

Start Wrapped
  ├─ ctx.continuity.getWatchHistory()               local
  ├─ $anilist.getRawAnimeCollection(false)           Seanime cache first
  ├─ $anilist.getAnimeDetails(id)                    at most 15 prioritized IDs; long-lived plugin cache
  ├─ $anilist.getAnimeCollectionWithRelations()      only when recommendations need more candidates
  └─ $anilist.customQuery(Page.media)                one batch for final missing community ratings; 7-day cache
       └─ immutable WrappedSession + bounded slide artwork preload
            └─ slide navigation                     zero API/fetch calls
```

Manual refresh uses `getRawAnimeCollection(true)` on the next start. Metadata failures and rate limits are caught per item; cached/basic collection data still produces a partial Wrapped.

### Ranking algorithm

Top 5 ranking is deterministic and intentionally avoids invented period episode counts:

1. Personal AniList rating contributes 60% (`userScore / 10`). Unrated titles get no rating component.
2. Engagement contributes 40%: 85% completion ratio plus a 15% logarithmic absolute-progress bonus, both capped at 1. Unknown episode totals use the bounded logarithmic measure.
3. Latest saved watch/update timestamp and media ID break ties deterministically.

Top 5 slides show personal ratings alongside progress. Recommendation cards use AniList community ratings instead. Recommendations derive from the current Top 5's recommendation/relationship links, genres, and available studio metadata, with stronger weight for #1/#2. Planning membership is a bonus. Only the final ten candidates missing community scores are enriched, together in one native public GraphQL request. Successful scores and confirmed null values are cached for seven days; request failures are retried on the next session.

### Runtime score diagnostics

Seanime returns Go pointer-backed numbers that Goja exposes as boxed objects. The parser unwraps `valueOf()` before checking numbers, accepts numeric strings and the native `getScore()` getter, and rejects missing/zero/invalid values. Values above 10 use POINT_100 conversion; values 1–10 are retained for already-normalized adapters. Without score-format metadata a true POINT_100 value of 9 cannot be distinguished from a normalized 9; this compatibility policy deliberately preserves 9 as requested.

For one local debugging build, set `DEBUG_SCORES = true` in `src/index.ts`, then rebuild. Starting Wrapped logs only entry/rated counts and score field/type/range counts. It never logs titles, IDs, notes, or raw collections. Restore `false` after validation. See `docs/score-runtime.md` for source tracing and the reproduced Goja behavior.

Optional browser regression: `node scripts/verify-viewer.mjs` with Playwright and Microsoft Edge installed (or pass a Playwright package path). It checks 1440×900 and 1920×1080, text bounds, gold winner styling, the portrait recommendation grid, ratings and keyboard behavior. An optional third argument saves screenshots.

The displayed metric is explicitly labeled **episode progress**, not “episodes watched this period.”

## Historical-data limitations

Seanime continuity currently stores the latest watch-history record per media, not a complete historical episode ledger. Therefore:

- A period includes a title with any supported watch, start, completion, or nonzero-progress update timestamp inside it. Ratings use the deduplicated watched/completed union even when count slides are disabled.
- Current progress is useful for engagement ranking but is never claimed as period-specific viewing volume.
- Completed anime require a supported AniList completion date for bounded periods.
- The active weekday slide appears only when genuine continuity timestamps exist. It describes weekdays of latest saved title records, not total episodes watched per weekday.
- Studio affinity uses available metadata for up to the 15 most engaged titles to avoid unbounded AniList requests.
- If the available evidence cannot support a section, the viewer omits it or explains the missing value instead of fabricating one.

There is deliberately no “longest binge” statistic.

## Privacy and cleanup

The generated session remains inside Seanime and plugin storage. Closing the viewer cancels animation frames, removes keyboard/click handlers, zeros and destroys audio, and unmounts the webview. No polling or background interval is used.

## License

No commercial artwork or music is included. Runtime anime artwork comes from the user's Seanime/AniList data. Choose a source-code license before redistributing modified builds.
