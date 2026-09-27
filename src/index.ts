import { createDomain, type MediaRecord, type StudioMetadata, type WrappedDomain, type WrappedSession, type WrappedSettings } from "./domain";
import { createViewer, type WrappedViewer } from "./viewer";
import { createAudioRegistry } from "./generated/audio.generated";

declare const console: { error(...args: unknown[]): void; warn(...args: unknown[]): void };

const SHARED_DOMAIN = "seanime-wrapped/domain/v1";
const SHARED_VIEWER = "seanime-wrapped/viewer/v1";
const SHARED_AUDIO = "seanime-wrapped/audio/v1";

function init() {
  $shared.define(SHARED_DOMAIN, createDomain);
  $shared.define(SHARED_VIEWER, createViewer);
  $shared.define(SHARED_AUDIO, createAudioRegistry);

  $ui.register((ctx) => {
    const domain = $shared.use<WrappedDomain>("seanime-wrapped/domain/v1");
    const viewerBuilder = $shared.use<WrappedViewer>("seanime-wrapped/viewer/v1");
    const audioRegistry = $shared.use<Record<string, string>>("seanime-wrapped/audio/v1");
    const SETTINGS_KEY = "settings-v1";
    const DETAIL_CACHE_KEY = "metadata-cache-v1";
    const RATING_CACHE_KEY = "community-ratings-v1";
    // Set true for one local validation build. Reports counts/shapes only.
    const DEBUG_SCORES = false;
    const LAST_SESSION_KEY = "last-session-v1";
    const LAST_GENERATED_KEY = "last-generated-v1";
    const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='1' x2='1' y2='0'%3E%3Cstop stop-color='%235b6cff'/%3E%3Cstop offset='.55' stop-color='%23d946ef'/%3E%3Cstop offset='1' stop-color='%23ff7b8b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='128' height='128' rx='30' fill='%230b1020'/%3E%3Cpath d='M24 91V68a8 8 0 0 1 16 0v23zm22 0V45a8 8 0 0 1 16 0v46zm22 0V28a8 8 0 0 1 16 0v63zm22 0V54a8 8 0 0 1 16 0v37z' fill='url(%23g)'/%3E%3C/svg%3E";

    const defaults: WrappedSettings = {
      period: "month",
      includeWatched: true,
      includeCompleted: true,
      includeRatings: true,
      recommendations: true,
      soundtrack: "Random",
      volume: 30,
      autoAdvance: true
    };

    function loadSettings(): WrappedSettings {
      try {
        const stored = $storage.get<Partial<WrappedSettings>>(SETTINGS_KEY) || {};
        return { ...defaults, ...stored, volume: Math.max(0, Math.min(100, Number(stored.volume ?? defaults.volume))) };
      } catch {
        return { ...defaults };
      }
    }

    let settings = loadSettings();
    let forceRefresh = false;
    let viewerHtml = "";
    let viewerOpen = false;
    const loading = ctx.state(false);
    const error = ctx.state("");
    const refreshQueued = ctx.state(false);
    const lastGenerated = ctx.state($storage.get<string>(LAST_GENERATED_KEY) || "");

    const periodRef = ctx.fieldRef(settings.period);
    const watchedRef = ctx.fieldRef(settings.includeWatched);
    const completedRef = ctx.fieldRef(settings.includeCompleted);
    const ratingsRef = ctx.fieldRef(settings.includeRatings);
    const recommendationsRef = ctx.fieldRef(settings.recommendations);
    const soundtrackRef = ctx.fieldRef(settings.soundtrack);
    const volumeRef = ctx.fieldRef(String(settings.volume));
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
        soundtrack: soundtrackRef.current as WrappedSettings["soundtrack"],
        volume: Math.max(0, Math.min(100, Number(volumeRef.current) || 0)),
        autoAdvance: Boolean(autoAdvanceRef.current)
      };
      $storage.set(SETTINGS_KEY, settings);
    }

    periodRef.onValueChange(saveSettings);
    watchedRef.onValueChange(saveSettings);
    completedRef.onValueChange(saveSettings);
    ratingsRef.onValueChange(saveSettings);
    recommendationsRef.onValueChange(saveSettings);
    soundtrackRef.onValueChange(saveSettings);
    volumeRef.onValueChange(saveSettings);
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

    function chooseSoundtrack(): { source: string; label: string } {
      if (settings.soundtrack === "Off") return { source: "", label: "" };
      const available = Object.keys(audioRegistry).filter((label) => Boolean(audioRegistry[label]));
      if (!available.length) return { source: "", label: "" };
      let label: string = settings.soundtrack;
      if (label === "Random") label = available[Math.floor(Math.random() * available.length)];
      if (!audioRegistry[label]) {
        const fallback = available[0];
        ctx.toast.warning(`${label} is not installed locally; using ${fallback} instead.`);
        label = fallback;
      }
      return { source: audioRegistry[label] || "", label };
    }

    function startWrapped() {
      if (loading.get()) return;
      saveSettings();
      loading.set(true);
      error.set("");
      tray.update();
      try {
        const collection = $anilist.getRawAnimeCollection(forceRefresh);
        if (DEBUG_SCORES) console.warn("Wrapped score diagnostics", JSON.stringify(domain.scoreDiagnostics(collection)));
        const history = ctx.continuity.getWatchHistory();
        const all = domain.normalizeCollection(collection, history);
        if (!all.length) throw new Error("No anime collection data is available. Connect AniList or add anime to your local account first.");
        const preliminary = domain.buildSession(all, {}, [], settings);
        const metadata = collectMetadata(preliminary);
        collectRelationMetadata(metadata, preliminary);
        const session = domain.buildSession(all, metadata, [], settings);
        enrichRecommendationRatings(session);
        if (!session.watched.length && settings.includeWatched) {
          ctx.toast.warning("No defensible watch activity was found for this period. Wrapped will show the sections that are available.");
        }
        const soundtrack = chooseSoundtrack();
        if (settings.soundtrack !== "Off" && !soundtrack.source) ctx.toast.info("No local soundtrack files were found, so this Wrapped will play silently.");
        const viewerSettings = soundtrack.source ? settings : { ...settings, soundtrack: "Off" as const };
        viewerHtml = viewerBuilder.documentFor({ session, settings: viewerSettings, audioSource: soundtrack.source, audioLabel: soundtrack.label });
        $storage.set(LAST_SESSION_KEY, session);
        $storage.set(LAST_GENERATED_KEY, session.generatedAt);
        lastGenerated.set(session.generatedAt);
        forceRefresh = false;
        refreshQueued.set(false);
        viewer.update();
        viewer.show();
        viewerOpen = true;
        tray.close();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause || "Unknown error");
        error.set(message.includes("rate") ? "AniList is rate-limited right now. Cached data was insufficient; please try again later." : message);
        ctx.toast.error(error.get());
      } finally {
        loading.set(false);
        tray.update();
      }
    }

    const startHandler = ctx.eventHandler("seanime-wrapped-start", startWrapped);
    const refreshHandler = ctx.eventHandler("seanime-wrapped-refresh", () => {
      try {
        $storage.remove(DETAIL_CACHE_KEY);
        $storage.remove(RATING_CACHE_KEY);
        $storage.remove(LAST_SESSION_KEY);
      } catch {}
      forceRefresh = true;
      refreshQueued.set(true);
      error.set("");
      ctx.toast.info("Refresh queued. Fresh collection data will be requested when you press Start Wrapped.");
      tray.update();
    });

    const volumeHandlers: Record<number, string> = {};
    for (const value of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      volumeHandlers[value] = ctx.eventHandler(`seanime-wrapped-volume-${value}`, () => {
        volumeRef.setValue(String(value));
        saveSettings();
        tray.update();
      });
    }

    const tray = ctx.newTray({ iconUrl: icon, withContent: true, isDrawer: true, width: "390px", minHeight: "620px" });
    tray.render(() => {
      const currentVolume = Math.max(0, Math.min(100, Number(volumeRef.current) || 0));
      const availableTracks = Object.keys(audioRegistry).filter((label) => Boolean(audioRegistry[label]));
      const soundtrackControls = availableTracks.length ? tray.stack([
        tray.select("Track", { fieldRef: soundtrackRef, options: ["Random", "Inferno", "Bling-Bang-Bang-Born", "Otonoke", "Black Catcher", "Off"].map((value) => ({ label: value, value })) }),
        tray.text(`Local tracks available: ${availableTracks.length}/4`, { className: "sw-note" }),
        tray.text(`Volume · ${currentVolume}%`, { className: "sw-label" }),
        tray.flex([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => tray.div([
          tray.button(String(value), { onClick: volumeHandlers[value], size: "xs" })
        ], { className: value <= currentVolume ? "is-on" : "" })), { className: "sw-volume", gap: 1 })
      ], { gap: 2 }) : tray.text("No local soundtracks installed", { className: "sw-note" });
      return tray.stack([
        tray.css(`
          .sw-shell{padding:4px}.sw-header{padding:8px 4px 16px;border-bottom:1px solid rgba(255,255,255,.09)}
          .sw-title{font-size:1.25rem!important;font-weight:800;letter-spacing:-.025em}.sw-subtitle{font-size:.79rem!important;color:rgba(255,255,255,.58)}
          .sw-section{padding:14px 4px 2px}.sw-label{font-size:.7rem!important;text-transform:uppercase;letter-spacing:.13em;color:rgba(255,255,255,.48);font-weight:750}
          .sw-volume{display:flex;gap:3px!important;align-items:center}.sw-volume button{min-width:0!important;width:25px!important;height:9px!important;padding:0!important;border-radius:99px!important;font-size:0!important;background:rgba(255,255,255,.13)!important}.sw-volume .is-on button{background:linear-gradient(90deg,#6175ff,#ed4fd8)!important;box-shadow:0 0 9px rgba(222,69,211,.3)}
          .sw-primary button{width:100%;background:linear-gradient(100deg,#536cff,#a855f7 54%,#f24f9d)!important;border:0!important;font-weight:800!important;box-shadow:0 10px 28px rgba(132,83,255,.28)}
          .sw-actions button{flex:1}.sw-note{font-size:.72rem!important;color:rgba(255,255,255,.48);line-height:1.4}.sw-error{color:#ff9ba8!important;font-size:.78rem!important}
        `),
        tray.div([
          tray.flex([
            tray.img(icon, { alt: "", width: "42px", height: "42px" }),
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
          tray.text("Soundtrack", { className: "sw-label" }),
          soundtrackControls
        ], { className: "sw-section" }),
        tray.div([
          tray.text("Playback", { className: "sw-label" }),
          tray.switch("Auto-advance slides", { fieldRef: autoAdvanceRef })
        ], { className: "sw-section" }),
        error.get() ? tray.text(error.get(), { className: "sw-error" }) : tray.div([]),
        refreshQueued.get() ? tray.alert({ title: "Refresh queued", description: "Fresh data will be requested only after Start Wrapped is pressed.", intent: "info" }) : tray.div([]),
        tray.div([
          tray.button(loading.get() ? "Preparing Wrapped…" : "Start Wrapped", { onClick: startHandler, loading: loading.get(), disabled: loading.get(), size: "lg" })
        ], { className: "sw-primary" }),
        tray.flex([
          tray.button("Refresh Data", { onClick: refreshHandler, intent: "gray-subtle" }),
          tray.badge(`${availableTracks.length} soundtrack${availableTracks.length === 1 ? "" : "s"}`, { intent: availableTracks.length ? "success" : "gray", size: "sm" })
        ], { className: "sw-actions", gap: 2 }),
        tray.text(lastGenerated.get() ? `Last generated ${formatGeneratedAt(lastGenerated.get())}` : "No Wrapped generated yet", { className: "sw-note" }),
        tray.text("Opening this tray never loads AniList data. Start Wrapped prepares one offline presentation session.", { className: "sw-note" })
      ], { className: "sw-shell", gap: 2 });
    });

    tray.onOpen(() => { tray.update(); });
    tray.onClose(() => { /* The viewer has its own lifecycle; tray close is intentionally cheap. */ });
  });
}
