import { createDomain, type AniListListActivity, type MediaRecord, type SourceSnapshot, type StudioMetadata, type WrappedDomain, type WrappedSession, type WrappedSettings } from "./domain";
import { createViewer, type WrappedViewer } from "./viewer";

declare const console: { error(...args: unknown[]): void; warn(...args: unknown[]): void };

const SHARED_DOMAIN = "seanime-wrapped/domain/v1";
const SHARED_VIEWER = "seanime-wrapped/viewer/v1";

function init() {
  $shared.define(SHARED_DOMAIN, createDomain);
  $shared.define(SHARED_VIEWER, createViewer);

  $ui.register((ctx) => {
    const domain = $shared.use<WrappedDomain>("seanime-wrapped/domain/v1");
    const viewerBuilder = $shared.use<WrappedViewer>("seanime-wrapped/viewer/v1");
    const SETTINGS_KEY = "settings-v1";
    // v2 retains AniList media type so recommendation candidates can be
    // rejected unless they are explicitly ANIME.
    const DETAIL_CACHE_KEY = "metadata-cache-v2";
    const RATING_CACHE_KEY = "community-ratings-v1";
    // Set true for one local validation build. Reports counts/shapes only.
    const DEBUG_SCORES = false;
    const LAST_SESSION_KEY = "last-session-v1";
    const LAST_GENERATED_KEY = "last-generated-v1";
    const SOURCE_REVISION_KEY = "source-revision-v1";
    const SOURCE_SNAPSHOT_KEY = "source-snapshot-v1";
    // UI callbacks run in an isolated Goja scope, so tray-only assets must be
    // declared inside this callback rather than captured from module scope.
    const trayIconUrl = "https://raw.githubusercontent.com/DefnoJae/Seanime-Wrapped/main/assets/icon.png";

    const defaults: WrappedSettings = {
      period: "month",
      includeWatched: true,
      includeCompleted: true,
      includeRatings: true,
      recommendations: true,
      autoAdvance: true
    };

    function loadSettings(): WrappedSettings {
      try {
        const stored = $storage.get<Partial<WrappedSettings>>(SETTINGS_KEY) || {};
        return { ...defaults, ...stored };
      } catch {
        return { ...defaults };
      }
    }

    let settings = loadSettings();
    let forceRefresh = false;
    let viewerHtml = "";
    let viewerOpen = false;
    let animeNavigationPending = false;
    let activityUsername = "";
    let activityUserId = 0;
    const loading = ctx.state(false);
    const loadingStage = ctx.state("");
    const loadingProgress = ctx.state(0);
    const error = ctx.state("");
    const lastGenerated = ctx.state($storage.get<string>(LAST_GENERATED_KEY) || "");

    const periodRef = ctx.fieldRef(settings.period);
    const watchedRef = ctx.fieldRef(settings.includeWatched);
    const completedRef = ctx.fieldRef(settings.includeCompleted);
    const ratingsRef = ctx.fieldRef(settings.includeRatings);
    const recommendationsRef = ctx.fieldRef(settings.recommendations);
    const autoAdvanceRef = ctx.fieldRef(settings.autoAdvance);

    function formatGeneratedAt(value: string): string {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "an unknown time";
      const pad = (part: number) => String(part).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function saveSettings() {
      settings = {
        period: periodRef.current as WrappedSettings["period"],
        includeWatched: Boolean(watchedRef.current),
        includeCompleted: Boolean(completedRef.current),
        includeRatings: Boolean(ratingsRef.current),
        recommendations: Boolean(recommendationsRef.current),
        autoAdvance: Boolean(autoAdvanceRef.current)
      };
      $storage.set(SETTINGS_KEY, settings);
    }

    periodRef.onValueChange(saveSettings);
    watchedRef.onValueChange(saveSettings);
    completedRef.onValueChange(saveSettings);
    ratingsRef.onValueChange(saveSettings);
    recommendationsRef.onValueChange(saveSettings);
    autoAdvanceRef.onValueChange(saveSettings);

    const viewer = ctx.newWebview({
      slot: "fixed",
      hidden: true,
      width: "100vw",
      height: "100vh",
      maxWidth: "none",
      maxHeight: "none",
      zIndex: 9999,
      style: "position:fixed;inset:0;width:100vw;height:100vh;border:0;border-radius:0;background:#060914;",
      window: { frameless: true, draggable: false, defaultX: 0, defaultY: 0 }
    });
    viewer.setContent(() => viewerHtml);
    viewer.channel.on("close", () => {
      viewerOpen = false;
      viewer.hide();
    });
    viewer.channel.on("open-anime", (payload: { mediaId?: number } | number) => {
      const mediaId = Number(typeof payload === "number" ? payload : payload?.mediaId || 0);
      if (!Number.isFinite(mediaId) || mediaId <= 0 || animeNavigationPending) return;
      animeNavigationPending = true;
      viewerOpen = false;
      viewer.hide();
      ctx.setTimeout(() => {
        try {
          ctx.screen.navigateTo("/entry", { id: String(mediaId) });
        } catch (cause) {
          console.warn("Seanime Wrapped could not open the anime entry", cause);
          viewer.show();
          viewerOpen = true;
          ctx.toast.warning("The anime page could not be opened. Wrapped is still available.");
        } finally {
          animeNavigationPending = false;
        }
      }, 100);
    });
    viewer.onUnmount(() => { viewerOpen = false; });

    function normalizeDetail(mediaId: number, detail: any): StudioMetadata {
      const recommendations: MediaRecord[] = [];
      for (const edge of detail?.recommendations?.edges || []) {
        const media = edge?.node?.mediaRecommendation;
        if (media?.id) recommendations.push(domain.mediaFromBase(media));
      }
      const relations: MediaRecord[] = [];
      for (const edge of detail?.relations?.edges || []) {
        if (edge?.node?.id) relations.push(domain.mediaFromBase(edge.node));
      }
      return {
        studioNames: (detail?.studios?.nodes || []).map((studio: any) => String(studio?.name || "")).filter(Boolean),
        recommendations,
        relations
      };
    }

    function collectAniListActivity(period: { start: number | null; end: number }): AniListListActivity[] {
      if (period.start === null) return [];
      try {
        const rawUsername = $database.anilist.getUsername();
        const username = rawUsername ? String(rawUsername) : "";
        if (!username) return [];
        if (username !== activityUsername || !activityUserId) {
          const userResult = $anilist.customQuery<{ User?: { id?: number } }>({
            query: "query WrappedActivityUser($name: String) { User(name: $name) { id } }",
            variables: { name: username }
          }, "");
          activityUsername = username;
          activityUserId = Number(userResult?.User?.id || 0);
        }
        if (!activityUserId) return [];
        const activities: AniListListActivity[] = [];
        for (let page = 1; page <= 4; page++) {
          const result = $anilist.customQuery<{
            Page?: {
              pageInfo?: { hasNextPage?: boolean };
              activities?: { mediaId?: number; status?: string; progress?: string | null; createdAt?: number }[];
            };
          }>({
            query: "query WrappedListActivity($page: Int, $userId: Int, $start: Int, $end: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } activities(userId: $userId, type: ANIME_LIST, createdAt_greater: $start, createdAt_lesser: $end, sort: ID_DESC) { ... on ListActivity { mediaId status progress createdAt } } } }",
            variables: {
              page,
              userId: activityUserId,
              start: Math.max(0, Math.floor(period.start / 1000) - 1),
              end: Math.ceil(period.end / 1000) + 1
            }
          }, "");
          for (const activity of result?.Page?.activities || []) {
            const mediaId = Number(activity?.mediaId || 0), createdAt = Number(activity?.createdAt || 0) * 1000;
            if (!mediaId || !createdAt) continue;
            activities.push({
              mediaId,
              createdAt,
              status: String(activity?.status || ""),
              progress: activity?.progress == null ? null : String(activity.progress)
            });
          }
          if (!result?.Page?.pageInfo?.hasNextPage) break;
        }
        return activities;
      } catch (cause) {
        console.warn("Seanime Wrapped AniList activity unavailable", cause);
        return [];
      }
    }

    function collectMetadata(preliminary: WrappedSession): Record<number, StudioMetadata> {
      const stored = forceRefresh ? {} : ($storage.get<Record<string, StudioMetadata>>(DETAIL_CACHE_KEY) || {});
      const cache: Record<number, StudioMetadata> = {};
      for (const key of Object.keys(stored)) cache[Number(key)] = stored[key];
      const prioritized: MediaRecord[] = [
        ...preliminary.topFive,
        ...preliminary.watched.slice().sort((a, b) => b.progress - a.progress || a.mediaId - b.mediaId)
      ];
      const ids = Array.from(new Set(prioritized.map((media) => media.mediaId))).slice(0, 15);
      let failures = 0;
      for (const mediaId of ids) {
        if (cache[mediaId] && !forceRefresh) continue;
        try {
          cache[mediaId] = normalizeDetail(mediaId, $anilist.getAnimeDetails(mediaId));
        } catch (cause) {
          failures += 1;
          console.warn("Seanime Wrapped metadata unavailable", mediaId, cause);
        }
      }
      try { $storage.set(DETAIL_CACHE_KEY, cache); } catch {}
      if (failures && failures === ids.length) ctx.toast.warning("Detailed studio/recommendation metadata was unavailable; the recap will continue with cached collection data.");
      return cache;
    }

    function collectRelationMetadata(cache: Record<number, StudioMetadata>, preliminary: WrappedSession) {
      if (!settings.recommendations) return;
      const planningCount = preliminary.recommendations.length;
      if (planningCount >= 10) return;
      try {
        const collection = $anilist.getAnimeCollectionWithRelations();
        for (const list of collection?.MediaListCollection?.lists || []) {
          for (const entry of list?.entries || []) {
            const id = Number(entry?.media?.id || 0);
            if (!id || !entry?.media?.relations?.edges?.length) continue;
            const current = cache[id] || { studioNames: [], recommendations: [], relations: [] };
            current.relations = entry.media.relations.edges.map((edge) => edge?.node).filter((media): media is $app.AL_BaseAnime => Boolean(media?.id)).map((media) => domain.mediaFromBase(media));
            cache[id] = current;
          }
        }
      } catch (cause) {
        console.warn("Seanime Wrapped relation collection unavailable", cause);
      }
    }

    function enrichRecommendationRatings(session: WrappedSession) {
      const cache = forceRefresh ? {} : ($storage.get<Record<string, { score: number | null; at: number }>>(RATING_CACHE_KEY) || {});
      const now = Date.now();
      const missing = session.recommendations.filter((media) => {
        if (media.globalScore !== null && media.globalScore > 0) return false;
        const hit = cache[String(media.mediaId)];
        if (hit && now - hit.at < 7 * 86400000) { media.globalScore = hit.score; return false; }
        return true;
      });
      if (!missing.length) return;
      try {
        // Native customQuery returns the unwrapped GraphQL data object. Public
        // community scores need no token; one request covers at most ten IDs.
        const result = $anilist.customQuery<{ Page?: { media?: { id: number; meanScore?: number | null }[] } }>({
          query: "query WrappedRatings($ids: [Int]) { Page(page: 1, perPage: 10) { media(id_in: $ids, type: ANIME) { id meanScore } } }",
          variables: { ids: missing.map((media) => media.mediaId) }
        }, "");
        for (const item of result?.Page?.media || []) {
          const score = domain.mediaFromBase(item).globalScore;
          cache[String(item.id)] = { score: score && score > 0 ? score : null, at: now };
          const candidate = missing.find((media) => media.mediaId === Number(item.id));
          if (candidate) candidate.globalScore = cache[String(item.id)].score;
        }
        $storage.set(RATING_CACHE_KEY, cache);
      } catch {
        // Failed requests are not negative-cached, so the next session retries.
        ctx.toast.warning("Some AniList community ratings are temporarily unavailable.");
      }
    }

    function updateLoading(stage: string, progress: number) {
      loadingStage.set(stage);
      loadingProgress.set(progress);
      tray.update();
    }

    function failGeneration(cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause || "Unknown error");
      error.set(message.includes("rate") ? "AniList is rate-limited right now. Cached data was insufficient; please try again later." : message);
      loading.set(false);
      loadingStage.set("");
      loadingProgress.set(0);
      tray.update();
      ctx.toast.error(error.get());
    }

    function later(fn: () => void, delay = 45) {
      ctx.setTimeout(() => {
        try { fn(); } catch (cause) { failGeneration(cause); }
      }, delay);
    }

    function startWrapped() {
      if (loading.get()) return;
      saveSettings();
      loading.set(true);
      error.set("");
      updateLoading("Reading your anime library…", 8);

      later(() => {
        // Wrapped statistics are always rebuilt from a current collection.
        // Seanime's bypass flag prevents a prior in-memory AniList snapshot
        // from freezing progress, completion status, or user scores.
        const collection = $anilist.getRawAnimeCollection(true);
        if (DEBUG_SCORES) console.warn("Wrapped score diagnostics", JSON.stringify(domain.scoreDiagnostics(collection)));
        const history = ctx.continuity.getWatchHistory();
        const all = domain.normalizeCollection(collection, history);
        if (!all.length) throw new Error("No anime collection data is available. Connect AniList or add anime to your local account first.");
        const generationNow = Date.now();
        const period = domain.periodFor(settings.period, generationNow);
        const listActivities = collectAniListActivity(period);
        const previousSnapshot = $storage.get<SourceSnapshot>(SOURCE_SNAPSHOT_KEY) || {};
        const sourceSnapshot = domain.buildSourceSnapshot(all, previousSnapshot, listActivities, generationNow);
        const activityContext = { snapshot: sourceSnapshot, listActivities };
        const sourceRevision = domain.sourceRevision(all);
        const previousRevision = $storage.get<string>(SOURCE_REVISION_KEY) || "";
        if (sourceRevision !== previousRevision) {
          try { $storage.remove(LAST_SESSION_KEY); } catch {}
          viewerHtml = "";
          if (viewerOpen) {
            viewerOpen = false;
            viewer.hide();
          }
        }
        updateLoading("Calculating your stats…", 30);

        later(() => {
          const preliminary = domain.buildSession(all, {}, [], settings, generationNow, activityContext);
          updateLoading("Building your Top 5…", 52);

          later(() => {
            const metadata = collectMetadata(preliminary);
            updateLoading("Finding what you might watch next…", 74);

            later(() => {
              collectRelationMetadata(metadata, preliminary);
              const session = domain.buildSession(all, metadata, [], settings, generationNow, activityContext);
              enrichRecommendationRatings(session);
              if (!session.watched.length && settings.includeWatched) {
                ctx.toast.warning("No defensible watch activity was found for this period. Wrapped will show the sections that are available.");
              }
              updateLoading("Preparing your Wrapped…", 92);

              later(() => {
                viewerHtml = viewerBuilder.documentFor({ session, settings });
                $storage.set(LAST_SESSION_KEY, session);
                $storage.set(SOURCE_REVISION_KEY, sourceRevision);
                $storage.set(SOURCE_SNAPSHOT_KEY, sourceSnapshot);
                $storage.set(LAST_GENERATED_KEY, session.generatedAt);
                lastGenerated.set(session.generatedAt);
                forceRefresh = false;
                updateLoading("Your Wrapped is ready.", 100);
                viewer.update();

                later(() => {
                  viewer.show();
                  viewerOpen = true;
                  loading.set(false);
                  loadingStage.set("");
                  tray.close();
                  tray.update();
                }, 180);
              });
            });
          });
        });
      });
    }

    const startHandler = ctx.eventHandler("seanime-wrapped-start", startWrapped);
    const refreshHandler = ctx.eventHandler("seanime-wrapped-refresh", () => {
      if (loading.get()) return;
      try {
        $storage.remove(DETAIL_CACHE_KEY);
        $storage.remove(RATING_CACHE_KEY);
        $storage.remove(LAST_SESSION_KEY);
        $storage.remove(SOURCE_REVISION_KEY);
      } catch {}
      forceRefresh = true;
      viewerHtml = "";
      if (viewerOpen) {
        viewerOpen = false;
        viewer.hide();
      }
      error.set("");
      ctx.toast.info("Refreshing Seanime Wrapped with current anime data.");
      startWrapped();
    });

    const tray = ctx.newTray({ iconUrl: trayIconUrl, withContent: true, isDrawer: true, width: "390px", minHeight: "620px" });
    tray.render(() => {
      return tray.stack([
        tray.css(`
          .sw-shell{padding:4px}.sw-header{padding:8px 4px 16px;border-bottom:1px solid rgba(255,255,255,.09)}
          .sw-header img{border-radius:11px;object-fit:cover;box-shadow:0 0 20px rgba(111,88,255,.28)}
          .sw-title{font-size:1.25rem!important;font-weight:800;letter-spacing:-.025em}.sw-subtitle{font-size:.79rem!important;color:rgba(255,255,255,.58)}
          .sw-section{padding:14px 4px 2px}.sw-label{font-size:.7rem!important;text-transform:uppercase;letter-spacing:.13em;color:rgba(255,255,255,.48);font-weight:750}
          .sw-primary button{width:100%;background:linear-gradient(100deg,#536cff,#a855f7 54%,#f24f9d)!important;border:0!important;font-weight:800!important;box-shadow:0 10px 28px rgba(132,83,255,.28)}
          .sw-actions button{flex:1}.sw-note{font-size:.72rem!important;color:rgba(255,255,255,.48);line-height:1.4}.sw-error{color:#ff9ba8!important;font-size:.78rem!important}
          .sw-loading{padding:14px;border:1px solid rgba(139,92,246,.32);border-radius:13px;background:rgba(88,64,160,.12)}
          .sw-loading-text{font-size:.8rem!important;font-weight:700;color:rgba(255,255,255,.88)}
          .sw-loading-track{height:8px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.1)}
          .sw-loading-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#536cff,#b855f7 58%,#f24f9d);box-shadow:0 0 14px rgba(226,79,207,.42);transition:width .55s cubic-bezier(.22,.8,.2,1);position:relative}
          .sw-loading-fill:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:sw-shimmer 1.15s linear infinite}@keyframes sw-shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
        `),
        tray.div([
          tray.flex([
            tray.img(trayIconUrl, { alt: "", width: "42px", height: "42px" }),
            tray.stack([
              tray.text("Seanime Wrapped", { className: "sw-title" }),
              tray.text("Your anime watching, wrapped.", { className: "sw-subtitle" })
            ], { gap: 0 })
          ], { gap: 3 })
        ], { className: "sw-header" }),
        tray.div([
          tray.text("Time period", { className: "sw-label" }),
          tray.select("Time period", {
            fieldRef: periodRef,
            options: [
              { label: "This month", value: "month" }, { label: "Previous month", value: "previous-month" },
              { label: "Last 3 months", value: "last-3" }, { label: "Last 6 months", value: "last-6" },
              { label: "Year to date", value: "ytd" }, { label: `Full year ${new Date().getFullYear() - 1}`, value: "full-year" },
              { label: "All time", value: "all-time" }
            ]
          })
        ], { className: "sw-section" }),
        tray.div([
          tray.text("Include in recap", { className: "sw-label" }),
          tray.switch("Watched anime", { fieldRef: watchedRef }),
          tray.switch("Completed anime", { fieldRef: completedRef }),
          tray.switch("Your ratings", { fieldRef: ratingsRef }),
          tray.switch("Recommendations", { fieldRef: recommendationsRef })
        ], { className: "sw-section" }),
        tray.div([
          tray.text("Playback", { className: "sw-label" }),
          tray.switch("Auto-advance slides", { fieldRef: autoAdvanceRef })
        ], { className: "sw-section" }),
        error.get() ? tray.text(error.get(), { className: "sw-error" }) : tray.div([]),
        loading.get() ? tray.stack([
          tray.text(loadingStage.get(), { className: "sw-loading-text" }),
          tray.div([
            tray.div([], { className: "sw-loading-fill", style: { width: `${loadingProgress.get()}%` } })
          ], { className: "sw-loading-track" }),
          tray.text(`${loadingProgress.get()}% · Building locally in Seanime`, { className: "sw-note" })
        ], { className: "sw-loading", gap: 2 }) : tray.div([]),
        tray.div([
          tray.button(loading.get() ? "Preparing Wrapped…" : "Start Wrapped", { onClick: startHandler, loading: loading.get(), disabled: loading.get(), size: "lg" })
        ], { className: "sw-primary" }),
        tray.div([
          tray.button("Refresh Data", { onClick: refreshHandler, intent: "gray-subtle", disabled: loading.get() })
        ], { className: "sw-actions" }),
        tray.text(lastGenerated.get() ? `Last generated ${formatGeneratedAt(lastGenerated.get())}` : "No Wrapped generated yet", { className: "sw-note" }),
        tray.text("Opening this tray never loads AniList data. Start Wrapped fetches current list data and prepares one offline presentation session.", { className: "sw-note" })
      ], { className: "sw-shell", gap: 2 });
    });

    tray.onOpen(() => { tray.update(); });
    tray.onClose(() => { /* The viewer has its own lifecycle; tray close is intentionally cheap. */ });
  });
}
