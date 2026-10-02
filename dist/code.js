// Seanime Wrapped v1.0.10 — generated bundle
function createDomain() {
    const fallbackArt = "https://raw.githubusercontent.com/DefnoJae/Seanime-Wrapped/main/assets/fallback.svg";
    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    function numberOrNull(value) {
        // Goja can expose pointer-backed primitives as boxed host values.
        if (value !== null && typeof value === "object" && typeof value.valueOf === "function") {
            const primitive = value.valueOf();
            if (typeof primitive === "number" || typeof primitive === "string")
                value = primitive;
        }
        if (typeof value === "string") {
            if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()))
                return null;
            value = Number(value);
        }
        return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    // The upstream JSON field is score; Goja also exposes GetScore as getScore.
    function scoreValue(entry) {
        return entry?.score ?? (typeof entry?.getScore === "function" ? entry.getScore() : null);
    }
    function extractUserScore(entry) {
        const score = numberOrNull(scoreValue(entry));
        if (score === null || score <= 0 || score > 100)
            return null;
        // Compatibility for normalized adapters. Values <=10 are ambiguous without
        // format metadata; preserve them per the plugin's 0-10 adapter contract.
        return score > 10 ? score / 10 : score;
    }
    function scoreDiagnostics(collection) {
        let entries = 0, rated = 0;
        const shapes = {};
        for (const list of collection?.MediaListCollection?.lists || []) {
            for (const entry of list?.entries || []) {
                entries++;
                const value = scoreValue(entry), numeric = numberOrNull(value);
                if (extractUserScore(entry) !== null)
                    rated++;
                const field = entry?.score != null ? "score" : typeof entry?.getScore === "function" ? "getScore()" : "missing";
                const shape = `${field}:${value === null ? "null" : typeof value}:${numeric === null ? "missing/invalid" : numeric <= 0 ? "zero/negative" : numeric <= 10 ? "1-10" : "11-100"}`;
                shapes[shape] = (shapes[shape] || 0) + 1;
            }
        }
        return { entries, rated, shapes };
    }
    function timestamp(value) {
        const numeric = numberOrNull(value);
        if (numeric !== null)
            return numeric > 1e12 ? numeric : numeric * 1000;
        if (typeof value !== "string" || !value)
            return null;
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    function fuzzyDate(value) {
        if (!value || !value.year)
            return null;
        return new Date(Number(value.year), Math.max(0, Number(value.month || 1) - 1), Number(value.day || 1), 12).getTime();
    }
    function titleOf(media) {
        return media?.title?.userPreferred || media?.title?.english || media?.title?.romaji || media?.title?.native || `Anime #${media?.id || "?"}`;
    }
    function mediaTypeOf(media) {
        let value = media?.type ?? (typeof media?.getType === "function" ? media.getType() : null);
        if (value !== null && typeof value === "object" && typeof value.valueOf === "function")
            value = value.valueOf();
        if (typeof value !== "string" || !value.trim())
            return null;
        return value.trim().toUpperCase();
    }
    function mediaFromBase(media, entry, history) {
        return {
            mediaId: Number(media?.id || history?.mediaId || 0),
            mediaType: mediaTypeOf(media),
            title: titleOf(media),
            cover: media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || fallbackArt,
            banner: media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || fallbackArt,
            color: media?.coverImage?.color || "#8b5cf6",
            genres: Array.isArray(media?.genres) ? media.genres.map((genre) => genre?.valueOf()).filter((genre) => typeof genre === "string") : [],
            globalScore: numberOrNull(media?.meanScore),
            // getRawAnimeCollection requests POINT_100 scores. Wrapped presents user
            // ratings on a 0-10 scale, while AniList meanScore remains POINT_100.
            userScore: extractUserScore(entry),
            status: String(entry?.status || "UNKNOWN"),
            progress: Math.max(0, Number(entry?.progress || 0)),
            episodes: numberOrNull(media?.episodes),
            duration: numberOrNull(media?.duration),
            updatedAt: timestamp(entry?.updatedAt),
            startedAt: fuzzyDate(entry?.startedAt),
            completedAt: fuzzyDate(entry?.completedAt),
            historyAt: timestamp(history?.timeUpdated || history?.timeAdded),
            historyEpisode: numberOrNull(history?.episodeNumber)
        };
    }
    function normalizeCollection(collection, watchHistory) {
        const byId = {};
        const lists = collection?.MediaListCollection?.lists || [];
        for (const list of lists) {
            for (const entry of list?.entries || []) {
                const media = entry?.media;
                const id = Number(media?.id || 0);
                if (!id)
                    continue;
                const normalized = mediaFromBase(media, entry, watchHistory[id]);
                const existing = byId[id];
                if (!existing)
                    byId[id] = normalized;
                else {
                    const newer = (normalized.updatedAt || 0) > (existing.updatedAt || 0) ? normalized : existing;
                    const older = newer === normalized ? existing : normalized;
                    byId[id] = {
                        ...newer,
                        mediaType: newer.mediaType ?? older.mediaType,
                        userScore: newer.userScore ?? older.userScore,
                        globalScore: newer.globalScore ?? older.globalScore
                    };
                }
            }
        }
        return Object.keys(byId).map((id) => byId[Number(id)]).sort((a, b) => a.mediaId - b.mediaId);
    }
    function sourceRevision(all) {
        return JSON.stringify(all.slice().sort((a, b) => a.mediaId - b.mediaId).map((media) => ({
            mediaId: media.mediaId,
            mediaType: media.mediaType,
            title: media.title,
            cover: media.cover,
            banner: media.banner,
            genres: media.genres.slice().sort(),
            globalScore: media.globalScore,
            userScore: media.userScore,
            status: media.status,
            progress: media.progress,
            episodes: media.episodes,
            duration: media.duration,
            updatedAt: media.updatedAt,
            startedAt: media.startedAt,
            completedAt: media.completedAt,
            historyAt: media.historyAt,
            historyEpisode: media.historyEpisode
        })));
    }
    function listActivityKind(activity) {
        const status = String(activity.status || "").toLowerCase();
        const progress = String(activity.progress || "").toLowerCase();
        const completed = status.includes("completed");
        const watched = completed || status.includes("watched episode") || status.includes("rewatched episode") || /\d/.test(progress);
        return { watched, completed };
    }
    function buildSourceSnapshot(all, previous = {}, listActivities = [], observedAt) {
        var _a;
        const now = observedAt || Date.now();
        const activitiesById = {};
        for (const activity of listActivities)
            (activitiesById[_a = activity.mediaId] || (activitiesById[_a] = [])).push(activity);
        const snapshot = {};
        for (const media of all) {
            const prior = previous[media.mediaId];
            const updatedTransitionAt = media.updatedAt && (!prior?.updatedAt || media.updatedAt > prior.updatedAt) ? media.updatedAt : now;
            let observedProgressAt = prior?.observedProgressAt || null;
            let observedCompletionAt = prior?.observedCompletionAt || null;
            if (prior && media.progress > prior.progress)
                observedProgressAt = updatedTransitionAt;
            if (prior && prior.status !== "COMPLETED" && media.status === "COMPLETED") {
                observedProgressAt = updatedTransitionAt;
                observedCompletionAt = updatedTransitionAt;
            }
            for (const activity of activitiesById[media.mediaId] || []) {
                const kind = listActivityKind(activity);
                if (kind.watched && (!observedProgressAt || activity.createdAt > observedProgressAt))
                    observedProgressAt = activity.createdAt;
                if (kind.completed && (!observedCompletionAt || activity.createdAt > observedCompletionAt))
                    observedCompletionAt = activity.createdAt;
            }
            snapshot[media.mediaId] = {
                status: media.status,
                progress: media.progress,
                userScore: media.userScore,
                updatedAt: media.updatedAt,
                startedAt: media.startedAt,
                completedAt: media.completedAt,
                historyAt: media.historyAt,
                historyEpisode: media.historyEpisode,
                observedProgressAt,
                observedCompletionAt
            };
        }
        return snapshot;
    }
    function periodFor(key, nowValue) {
        const now = new Date(nowValue || Date.now());
        const end = now.getTime();
        const monthName = MONTHS[now.getMonth()];
        if (key === "all-time")
            return { key, label: "All Time", context: "across your anime journey", start: null, end };
        if (key === "month")
            return { key, label: `${monthName} ${now.getFullYear()}`, context: "this month", start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end };
        if (key === "previous-month") {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const stop = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
            return { key, label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`, context: "that month", start: start.getTime(), end: stop };
        }
        if (key === "last-3" || key === "last-6") {
            const months = key === "last-3" ? 3 : 6;
            return { key, label: `Your Last ${months} Months`, context: `over the last ${months} months`, start: new Date(now.getFullYear(), now.getMonth() - months + 1, 1).getTime(), end };
        }
        if (key === "ytd")
            return { key, label: `${now.getFullYear()} So Far`, context: "this year", start: new Date(now.getFullYear(), 0, 1).getTime(), end };
        const year = now.getFullYear() - 1;
        return { key, label: `${year}`, context: `in ${year}`, start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() - 1 };
    }
    function inWindow(value, period) {
        if (!value)
            return false;
        return (period.start === null || value >= period.start) && value <= period.end;
    }
    function periodActivity(all, period, context = {}) {
        var _a;
        if (period.start === null)
            return all.map((media) => ({
                mediaId: media.mediaId,
                watched: media.progress > 0 || media.status === "COMPLETED" || media.historyAt !== null,
                completed: media.status === "COMPLETED",
                sources: ["all-time-current-state"]
            }));
        const activitiesById = {};
        for (const activity of context.listActivities || []) {
            if (inWindow(activity.createdAt, period))
                (activitiesById[_a = activity.mediaId] || (activitiesById[_a] = [])).push(activity);
        }
        const strongEvidence = (media) => {
            const snapshot = context.snapshot?.[media.mediaId];
            const activity = (activitiesById[media.mediaId] || []).some((item) => listActivityKind(item).watched);
            return inWindow(media.historyAt, period) || inWindow(media.startedAt, period) || inWindow(media.completedAt, period)
                || activity || inWindow(snapshot?.observedProgressAt || null, period) || inWindow(snapshot?.observedCompletionAt || null, period);
        };
        const fallbackCandidates = all.filter((media) => {
            const atEnd = media.episodes === null || media.episodes <= 0 || media.progress >= media.episodes;
            return !strongEvidence(media) && media.status === "COMPLETED" && media.progress > 0 && atEnd && inWindow(media.updatedAt, period);
        });
        // A handful of isolated, fully-completed updates can safely fill gaps in
        // AniList dates. A mass of such updates is characteristic of list imports.
        const fallbackAllowed = fallbackCandidates.length > 0
            && fallbackCandidates.length <= 5
            && fallbackCandidates.length <= Math.max(1, Math.ceil(all.length * .05));
        const fallbackIds = new Set(fallbackAllowed ? fallbackCandidates.map((media) => media.mediaId) : []);
        return all.map((media) => {
            const snapshot = context.snapshot?.[media.mediaId];
            const activities = activitiesById[media.mediaId] || [];
            const sources = [];
            let watched = false, completed = false;
            if (inWindow(media.historyAt, period)) {
                watched = true;
                sources.push("seanime-history");
                const atEnd = media.episodes !== null && media.episodes > 0 && Math.max(media.progress, media.historyEpisode || 0) >= media.episodes;
                if (media.status === "COMPLETED" && atEnd)
                    completed = true;
            }
            if (inWindow(media.startedAt, period)) {
                watched = true;
                sources.push("anilist-start-date");
            }
            if (inWindow(media.completedAt, period)) {
                watched = true;
                completed = media.status === "COMPLETED";
                sources.push("anilist-completion-date");
            }
            if (activities.some((activity) => listActivityKind(activity).watched)) {
                watched = true;
                if (activities.some((activity) => listActivityKind(activity).completed) && media.status === "COMPLETED")
                    completed = true;
                sources.push("anilist-list-activity");
            }
            if (inWindow(snapshot?.observedCompletionAt || null, period)) {
                watched = true;
                completed = media.status === "COMPLETED";
                sources.push("observed-status-transition");
            }
            else if (inWindow(snapshot?.observedProgressAt || null, period)) {
                watched = true;
                sources.push("observed-progress-transition");
            }
            if (fallbackIds.has(media.mediaId)) {
                watched = true;
                completed = true;
                sources.push("controlled-updated-at");
            }
            if (!sources.length)
                sources.push("no-dated-evidence");
            if (completed)
                watched = true;
            return { mediaId: media.mediaId, watched, completed, sources };
        });
    }
    function engagement(media, period) {
        const progress = Math.max(media.progress, media.historyEpisode || 0);
        const absolute = Math.min(Math.log1p(progress) / Math.log1p(100), 1);
        const completion = media.episodes && media.episodes > 0 ? Math.min(progress / media.episodes, 1) : absolute;
        const normalized = .85 * completion + .15 * absolute;
        return .6 * ((media.userScore || 0) / 10) + .4 * normalized;
    }
    function rankMedia(watched, period) {
        return watched.slice().sort((a, b) => {
            const scoreDiff = engagement(b, period) - engagement(a, period);
            if (scoreDiff)
                return scoreDiff;
            const dateDiff = (b.historyAt || b.completedAt || b.startedAt || 0) - (a.historyAt || a.completedAt || a.startedAt || 0);
            return dateDiff || a.mediaId - b.mediaId;
        }).slice(0, 5).map((media, index) => ({
            ...media,
            rank: index + 1,
            engagementScore: engagement(media, period),
            metric: `${media.userScore ? `Your score ★ ${media.userScore.toFixed(1)} · ` : ""}${Math.max(media.progress, media.historyEpisode || 0)} episode${Math.max(media.progress, media.historyEpisode || 0) === 1 ? "" : "s"} progress`
        }));
    }
    function genreStats(watched) {
        const counts = {};
        for (const media of watched)
            for (const genre of media.genres)
                counts[genre] = (counts[genre] || 0) + 1;
        const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
        return Object.keys(counts).map((name) => ({ name, count: counts[name], percentage: Math.round((counts[name] / total) * 100) }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 6);
    }
    function topStudio(watched, details) {
        const weights = {};
        const mediaByStudio = {};
        for (const media of watched) {
            const names = details[media.mediaId]?.studioNames || [];
            for (const name of names) {
                weights[name] = (weights[name] || 0) + Math.max(1, media.progress);
                (mediaByStudio[name] || (mediaByStudio[name] = [])).push(media);
            }
        }
        const name = Object.keys(weights).sort((a, b) => weights[b] - weights[a] || a.localeCompare(b))[0];
        return name ? { name, anime: mediaByStudio[name].slice().sort((a, b) => b.progress - a.progress || a.mediaId - b.mediaId).slice(0, 8) } : null;
    }
    function activeDay(watched, period) {
        const days = {};
        for (const media of watched) {
            if (!inWindow(media.historyAt, period))
                continue;
            const label = WEEKDAYS[new Date(media.historyAt).getDay()];
            days[label] = (days[label] || 0) + 1;
        }
        const entries = Object.keys(days).map((label) => ({ label, count: days[label] })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        if (!entries.length)
            return null;
        return { ...entries[0], interpretation: "Most titles whose latest saved watch activity falls on this weekday; not an episode-by-episode history." };
    }
    function recommendationPool(all, watched, details, discovery) {
        const pool = all.filter((media) => media.status === "PLANNING");
        for (const media of watched) {
            const detail = details[media.mediaId];
            if (detail)
                pool.push(...detail.recommendations, ...detail.relations);
        }
        pool.push(...discovery);
        const unique = {};
        for (const media of pool) {
            if (!media.mediaId)
                continue;
            const prior = unique[media.mediaId];
            unique[media.mediaId] = prior ? {
                ...prior,
                mediaType: prior.mediaType ?? media.mediaType,
                globalScore: prior.globalScore ?? media.globalScore,
                genres: Array.from(new Set([...prior.genres, ...media.genres]))
            } : media;
        }
        return Object.keys(unique).map((id) => unique[Number(id)]);
    }
    function recommend(all, topFive, details, discovery) {
        const excluded = new Set(all.filter((media) => media.status === "COMPLETED" || media.status === "CURRENT" || media.status === "DROPPED").map((media) => media.mediaId));
        const planning = new Set(all.filter((media) => media.status === "PLANNING").map((media) => media.mediaId));
        topFive.forEach((media) => excluded.add(media.mediaId));
        const candidates = recommendationPool(all, topFive, details, discovery)
            .filter((media) => media.mediaType === "ANIME" && !excluded.has(media.mediaId));
        const used = new Set();
        const selected = [];
        for (const seed of topFive) {
            const detail = details[seed.mediaId];
            const rankedForSeed = candidates.map((media) => {
                const direct = Boolean(detail?.recommendations.some((item) => item.mediaId === media.mediaId));
                const relation = Boolean(detail?.relations.some((item) => item.mediaId === media.mediaId));
                const overlap = media.genres.filter((genre) => seed.genres.includes(genre)).length;
                const sameStudio = Boolean(detail?.studioNames.some((name) => details[media.mediaId]?.studioNames.includes(name)));
                const affinityScore = (direct ? 1000 : 0) + (relation ? 700 : 0) + Math.min(overlap, 3) * 25
                    + (sameStudio ? 40 : 0) + (planning.has(media.mediaId) ? 20 : 0) + (media.globalScore || 0) / 10;
                return { media, affinityScore };
            }).sort((a, b) => b.affinityScore - a.affinityScore || (b.media.globalScore || 0) - (a.media.globalScore || 0) || a.media.mediaId - b.media.mediaId);
            let count = 0;
            for (const candidate of rankedForSeed) {
                if (count >= 2)
                    break;
                if (used.has(candidate.media.mediaId))
                    continue;
                used.add(candidate.media.mediaId);
                selected.push({
                    ...candidate.media,
                    reason: `From your #${seed.rank}`,
                    affinityScore: candidate.affinityScore,
                    sourceRank: seed.rank,
                    sourceMediaId: seed.mediaId
                });
                count++;
            }
        }
        return selected;
    }
    function buildSession(all, details, discovery, settings, nowValue, activityContext = {}) {
        const period = periodFor(settings.period, nowValue);
        const evidence = periodActivity(all, period, activityContext);
        const mediaById = {};
        for (const media of all)
            mediaById[media.mediaId] = media;
        const watched = settings.includeWatched ? evidence.filter((item) => item.watched).map((item) => mediaById[item.mediaId]) : [];
        const completed = settings.includeCompleted ? evidence.filter((item) => item.completed).map((item) => mediaById[item.mediaId]) : [];
        const ranked = rankMedia(watched, period);
        const genres = genreStats(watched);
        const studio = topStudio(watched, details);
        const relevantById = {};
        for (const item of evidence)
            if (item.watched || item.completed)
                relevantById[item.mediaId] = mediaById[item.mediaId];
        const relevant = Object.keys(relevantById).map((id) => relevantById[Number(id)]);
        const scored = settings.includeRatings ? relevant.filter((media) => media.userScore !== null && media.userScore > 0) : [];
        const averageScore = scored.length ? Math.round((scored.reduce((sum, media) => sum + media.userScore, 0) / scored.length) * 10) / 10 : null;
        const highestRated = ranked[0] || null;
        const recs = settings.recommendations ? recommend(all, ranked, details, discovery) : [];
        const day = activeDay(watched, period);
        const summary = [
            `${watched.length} anime watched`,
            `${completed.length} completed`,
            genres[0] ? `${genres[0].name} was your top genre` : "No dominant genre",
            averageScore === null ? "No user scores in this period" : `${averageScore.toFixed(1)} average user score`,
            ranked[0] ? `#1 anime: ${ranked[0].title}` : "No top anime available"
        ];
        if (day)
            summary.push(`${day.label} had the most latest-watch records`);
        const heroArt = Array.from(new Set([
            ranked[0], watched[0], ranked[1], highestRated, studio?.anime[0], completed[0], recs[0]
        ].filter((media) => Boolean(media)).map((media) => media.banner || media.cover).filter(Boolean))).slice(0, 8);
        return {
            version: 1,
            generatedAt: new Date(nowValue || Date.now()).toISOString(),
            period,
            accuracyNote: "Bounded-period membership prioritizes dated Seanime history, AniList start/completion dates and list activity, then observed status/progress transitions. Generic list updates are accepted only through a mass-import-safe completion fallback.",
            watched,
            completed,
            topFive: ranked,
            highestRated,
            highestRatedStudio: highestRated ? (details[highestRated.mediaId]?.studioNames?.[0] || null) : null,
            genres,
            topStudio: studio,
            averageScore,
            activeDay: day,
            recommendations: recs,
            heroArt: heroArt.length ? Array.from(new Set(heroArt)) : [fallbackArt],
            summary,
            enabled: { watched: settings.includeWatched, completed: settings.includeCompleted, ratings: settings.includeRatings, recommendations: settings.recommendations }
        };
    }
    return { fallbackArt, mediaFromBase, extractUserScore, scoreDiagnostics, normalizeCollection, sourceRevision, buildSourceSnapshot, periodFor, periodActivity, buildSession };
}
function createViewer() {
    function completedSlideDuration(count) {
        const shown = Math.min(6, Math.max(0, Math.floor(count)));
        return shown <= 1 ? 6000 : shown * 3000;
    }
    function safeJson(value) {
        return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
    }
    function documentFor(input) {
        const payload = safeJson({
            ...input,
            completedDuration: completedSlideDuration(input.session.completed.length),
            periodHeadline: input.session.period.label.replace(/\s+\d{4}$/, "").replace(/^Your\s+/, ""),
            scoreLabels: {
                highestRated: input.session.highestRated?.userScore === null || input.session.highestRated?.userScore === undefined
                    ? null
                    : Number(input.session.highestRated.userScore).toFixed(1),
                average: input.session.averageScore === null ? null : Number(input.session.averageScore).toFixed(1)
            }
        });
        return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Seanime Wrapped</title>
<style>
:root{color-scheme:dark;--pink:#f14fd9;--violet:#8b5cf6;--blue:#5d79ff;--glass:rgba(10,14,29,.55);--line:rgba(255,255,255,.17);--ease:cubic-bezier(.22,.8,.2,1)}
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#060914;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}button{font:inherit;color:inherit}
#app{position:fixed;inset:0;isolation:isolate;background:#070a14;opacity:1;transition:opacity .32s ease}.closing{opacity:0!important}
.background,.bg-layer,.veil,.grain{position:absolute;inset:-4%}.bg-layer{background:center/cover no-repeat;filter:blur(16px) saturate(1.22);transform:scale(1.08);opacity:0;transition:opacity 1s ease,transform 8s var(--ease)}.bg-layer.active{opacity:.68;transform:scale(1.13)}
.veil{inset:0;background:radial-gradient(circle at 78% 30%,transparent 0,rgba(3,6,18,.18) 32%,rgba(3,6,18,.82) 78%),linear-gradient(90deg,rgba(4,7,18,.94),rgba(4,7,18,.45) 58%,rgba(4,7,18,.78));z-index:1}.grain{z-index:2;opacity:.08;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E")}
.chrome{position:absolute;z-index:20;top:0;left:0;right:0;padding:max(18px,2.3vh) clamp(22px,4vw,74px);display:grid;gap:15px}.progress{display:flex;gap:7px}.segment{height:4px;flex:1;border-radius:99px;background:rgba(255,255,255,.23);overflow:hidden}.segment>i{display:block;width:0;height:100%;background:#fff;box-shadow:0 0 12px rgba(255,255,255,.65)}
.topline{display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:12px;font-weight:760;letter-spacing:-.02em}.logo{display:flex;align-items:end;gap:3px;height:27px}.logo i{display:block;width:6px;border-radius:7px;background:linear-gradient(180deg,#ff99a8,#e84fe0 55%,#596dff)}.logo i:nth-child(1){height:12px}.logo i:nth-child(2){height:21px}.logo i:nth-child(3){height:27px}.logo i:nth-child(4){height:17px}.actions{display:flex;gap:9px}.icon-btn{width:42px;height:42px;border:1px solid rgba(255,255,255,.13);border-radius:50%;background:rgba(5,8,20,.52);backdrop-filter:blur(14px);display:grid;place-items:center;cursor:pointer;transition:transform .2s ease,background .2s}.icon-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.icon-btn .filled{fill:currentColor;stroke:none}.icon-btn:hover{background:rgba(255,255,255,.13);transform:scale(1.05)}.icon-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}
.stage{position:absolute;inset:0;z-index:5}.slide{position:absolute;inset:0;padding:clamp(100px,14vh,145px) clamp(34px,8vw,140px) clamp(38px,7vh,75px);display:none;opacity:0;transform:scale(1.025);transition:opacity .55s ease,transform .7s var(--ease)}.slide.active{display:flex;opacity:1;transform:scale(1)}
.slide-inner{width:min(1420px,100%);height:100%;margin:auto;display:flex;align-items:center;position:relative}.eyebrow{font-size:clamp(12px,1vw,16px);text-transform:uppercase;letter-spacing:.16em;color:#d8d9ff;font-weight:750}.display{padding-bottom:.12em;overflow:visible;font-size:clamp(58px,8.4vw,138px);line-height:1.02;letter-spacing:-.065em;margin:14px 0 24px;max-width:920px}.gradient{display:inline-block;line-height:1.1;padding:.05em .03em .12em 0;overflow:visible;background:linear-gradient(110deg,#fff 8%,#efc8ff 35%,#ec52d7 70%,#7c8fff);-webkit-background-clip:text;background-clip:text;color:transparent}.subtitle{font-size:clamp(17px,1.6vw,27px);line-height:1.45;color:rgba(255,255,255,.78);max-width:620px}.reveal>*{opacity:0;transform:translateY(28px);filter:blur(8px)}.active .reveal>*{animation:reveal .72s var(--ease) forwards}.active .reveal>*:nth-child(2){animation-delay:.1s}.active .reveal>*:nth-child(3){animation-delay:.2s}.active .reveal>*:nth-child(4){animation-delay:.3s}@keyframes reveal{to{opacity:1;transform:none;filter:none}}
.count-layout{justify-content:space-between;gap:6vw;overflow:visible}.count-copy{max-width:620px;overflow:visible}.mega{font-size:clamp(84px,15vw,230px);line-height:.92;font-weight:900;letter-spacing:-.065em;padding:.05em .08em .12em .02em;overflow:visible;text-shadow:0 0 50px rgba(235,70,215,.3)}.posters{position:relative;width:min(42vw,610px);height:min(64vh,620px)}.poster{position:absolute;left:50%;top:50%;width:clamp(130px,15vw,220px);aspect-ratio:2/3;object-fit:cover;border-radius:18px;border:1px solid rgba(255,255,255,.3);box-shadow:0 30px 80px rgba(0,0,0,.55);transform:translate(-50%,-50%) rotate(var(--r)) translateX(var(--x));transition:transform 1s var(--ease);animation:posterIn .9s var(--ease) both;animation-delay:var(--d)}@keyframes posterIn{from{opacity:0;transform:translate(-50%,-40%) rotate(0) scale(.65)}}.shuffle-deck{position:relative;width:min(49vw,700px);height:min(60vh,580px);overflow:visible}.shuffle-poster{position:absolute;top:50%;left:50%;width:clamp(115px,13vw,190px);aspect-ratio:2/3;object-fit:cover;border-radius:18px;border:1px solid rgba(255,255,255,.32);box-shadow:0 24px 70px rgba(0,0,0,.55);transform:translate(-50%,-50%);transition:left 1s var(--ease),transform 1s var(--ease),filter 1s var(--ease);will-change:left,transform}
.genre-layout{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(400px,1.2fr);gap:9vw;align-items:center}.genre-name{font-size:clamp(64px,9vw,150px);font-weight:900;letter-spacing:-.06em;line-height:1}.donut{width:min(24vw,310px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;margin-top:30px;background:conic-gradient(var(--pink) calc(var(--p)*1%),rgba(255,255,255,.13) 0);box-shadow:0 0 55px rgba(230,65,214,.25)}.donut:after{content:attr(data-label);width:67%;aspect-ratio:1;border-radius:50%;background:rgba(7,10,22,.9);display:grid;place-items:center;font-size:clamp(30px,4vw,60px);font-weight:850}.bars{display:grid;gap:18px}.bar-row{display:grid;grid-template-columns:130px 1fr 48px;gap:18px;align-items:center}.bar-track{height:12px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden}.bar-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--pink));transition:width 1.2s var(--ease) .25s}.active .bar-fill{width:var(--w)}
.rank-layout{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(420px,1.1fr);gap:7vw}.rank-poster{justify-self:end;width:min(31vw,440px);max-height:66vh;aspect-ratio:2/3;object-fit:cover;border-radius:26px;border:1px solid rgba(255,255,255,.25);box-shadow:0 40px 100px rgba(0,0,0,.6),0 0 70px color-mix(in srgb,var(--accent) 35%,transparent);animation:rankPoster 1s var(--ease) both}@keyframes rankPoster{from{opacity:0;transform:translateX(-60px) rotate(-5deg) scale(.88)}}.rank-number{font-size:clamp(82px,13vw,220px);font-weight:950;letter-spacing:-.08em;line-height:1;color:var(--accent)}.rank-title{font-size:clamp(38px,5vw,78px);line-height:1.08;letter-spacing:-.045em;margin:26px 0 18px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;text-overflow:ellipsis;text-wrap:balance;max-width:100%}.winner .rank-poster{width:min(32vw,455px);border:2px solid #FFD76A;box-shadow:0 40px 110px rgba(0,0,0,.65),0 0 65px rgba(255,215,106,.28)}.winner .rank-number{color:#FFD76A;text-shadow:0 0 32px rgba(255,215,106,.2)}
.overview{align-items:flex-end}.overview-grid{width:100%;display:grid;grid-template-columns:repeat(5,1fr);align-items:end;gap:14px}.overview-card{position:relative;min-width:0;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.18);background:var(--glass);box-shadow:0 20px 60px rgba(0,0,0,.35);animation:cardUp .7s var(--ease) both;animation-delay:var(--d)}.overview-card.winner-card{translate:0 -16px;scale:1.025;border:2px solid #FFD76A;box-shadow:0 20px 60px rgba(0,0,0,.35),0 0 32px rgba(255,215,106,.22)}.winner-card .card-rank{color:#FFD76A}@keyframes cardUp{from{opacity:0;transform:translateY(60px)}}.overview-card img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover}.card-copy{padding:14px}.card-rank{position:absolute;top:12px;left:12px;font-size:30px;font-weight:900;text-shadow:0 3px 12px #000}.card-title{font-weight:750;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.meta{font-size:13px;color:rgba(255,255,255,.62);margin-top:5px}
.spotlight{display:grid;grid-template-columns:minmax(300px,1fr) minmax(310px,.9fr);gap:7vw}.spotlight-copy{align-self:center;min-width:0}.spotlight-title{font-size:clamp(46px,6.2vw,102px);line-height:1.06;letter-spacing:-.055em;margin:15px 0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;text-overflow:ellipsis;text-wrap:balance;max-width:100%}.hero-card{position:relative;justify-self:end;width:min(34vw,470px);height:min(66vh,650px);border-radius:28px;overflow:hidden;border:1px solid rgba(255,255,255,.22);box-shadow:0 40px 100px rgba(0,0,0,.58)}.hero-card img{width:100%;height:100%;object-fit:cover}.hero-card:after{content:"";position:absolute;inset:45% 0 0;background:linear-gradient(transparent,rgba(5,7,16,.96))}.hero-details{position:absolute;z-index:2;left:28px;right:28px;bottom:26px}.score{font-size:clamp(62px,8vw,120px);font-weight:930;letter-spacing:-.07em}.score small{font-size:.25em;color:rgba(255,255,255,.7);letter-spacing:0}
.studio-wall{position:absolute;right:0;width:55%;height:74%;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;opacity:.78;mask-image:linear-gradient(90deg,transparent,#000 25%)}.studio-wall img{width:100%;height:100%;min-height:0;object-fit:cover;border-radius:16px}.studio-copy{position:relative;z-index:3;max-width:min(850px,58vw);min-width:0}.studio-name{position:relative;z-index:2;font-size:clamp(70px,11vw,180px);font-weight:930;letter-spacing:-.07em;line-height:1.04;max-width:100%;text-wrap:balance;overflow-wrap:normal}.studio-name.medium{font-size:clamp(58px,8vw,132px);letter-spacing:-.06em}.studio-name.long{font-size:clamp(50px,6.7vw,108px);letter-spacing:-.05em}.compact-posters{display:flex;gap:10px;margin-top:28px}.compact-posters img{width:80px;aspect-ratio:2/3;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.25)}
.recommend{align-items:flex-start}.recommend-head{display:flex;justify-content:space-between;align-items:end;margin:0 auto 18px;width:min(1120px,100%)}.recommend-head h2{font-size:clamp(32px,3.7vw,58px);margin:0;letter-spacing:-.045em}.rec-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,180px));justify-content:center;gap:18px 22px;margin:auto}.rec-card{aspect-ratio:2/3;min-width:0;padding:0;color:inherit;text-align:left;font:inherit;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:rgba(9,13,27,.7);cursor:pointer;animation:cardUp .6s var(--ease) both;animation-delay:calc(var(--i)*55ms)}.rec-card:focus-visible{outline:3px solid #fff;outline-offset:3px}.rec-card img{width:100%;height:100%;object-fit:cover}.rec-card:after{content:"";position:absolute;inset:38% 0 0;background:linear-gradient(transparent,rgba(5,8,18,.98) 70%)}.rec-copy{position:absolute;z-index:2;left:12px;right:12px;bottom:10px}.rec-copy b{font-size:13px;line-height:1.18;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.36em}.rec-rating{display:block;color:#ffd86b;font-size:12px;font-weight:800;margin-top:5px}.rec-rank{position:absolute;z-index:3;top:9px;left:10px;width:28px;height:28px;border-radius:8px;background:rgba(6,8,18,.78);display:grid;place-items:center;font-weight:850}.reason{display:inline-block;font-size:9px;padding:3px 6px;border-radius:99px;background:rgba(126,94,255,.58);margin-top:5px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.final{align-items:center;justify-content:center;text-align:center}.final h1{font-size:clamp(50px,7vw,110px);line-height:1;letter-spacing:-.06em;margin:12px 0 35px}.summary{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:10px;width:min(850px,90vw);text-align:left}.summary div{padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:rgba(9,12,26,.45);backdrop-filter:blur(12px)}.thanks{margin-top:34px;font-size:clamp(18px,2vw,28px);color:#f0cbff}
.nav-hint{position:absolute;z-index:15;bottom:22px;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,.45);pointer-events:none}.loading{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:#080b17;transition:opacity .45s}.loading.hidden{opacity:0;pointer-events:none}.loader{text-align:center}.loader .logo{margin:0 auto 18px;transform:scale(1.5);justify-content:center}.loader p{color:rgba(255,255,255,.66)}
.display,.mega,.genre-name,.rank-number,.final h1{line-height:1.12;padding-top:.04em;padding-bottom:.14em;overflow:visible}.rank-title,.spotlight-title,.studio-name{padding-top:.04em;padding-bottom:.1em}.rank-metric{white-space:normal;line-height:1.4;overflow-wrap:anywhere}.card-copy{min-height:96px}
@media(max-width:900px){.slide{padding-left:28px;padding-right:28px}.genre-layout,.rank-layout,.spotlight{grid-template-columns:1fr}.posters,.shuffle-deck,.hero-card,.rank-poster{display:none}.overview-grid{grid-template-columns:repeat(3,1fr)}.overview-card:nth-child(n+4){display:none}.rec-grid{grid-template-columns:repeat(2,minmax(120px,180px));gap:16px}.recommend{overflow:auto}.studio-wall{width:75%;opacity:.38}.summary{grid-template-columns:1fr}.brand span{display:none}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.001ms!important;animation-delay:0ms!important;transition-duration:.001ms!important}.bg-layer{transform:scale(1.08)!important}}
</style></head><body tabindex="-1">
<main id="app" tabindex="-1" aria-label="Seanime Wrapped presentation"><div class="background"><div id="bgA" class="bg-layer active"></div><div id="bgB" class="bg-layer"></div><div class="veil"></div><div class="grain"></div></div>
<header class="chrome"><div id="progress" class="progress" aria-label="Slide progress"></div><div class="topline"><div class="brand"><span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Seanime Wrapped</span></div><div class="actions"><button id="pause" class="icon-btn" aria-label="Pause auto-advance" title="Pause / resume"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button><button id="close" class="icon-btn" aria-label="Close Wrapped" title="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div></header>
<section id="stage" class="stage" aria-live="polite"></section><div class="nav-hint">← → navigate · Space pauses · Esc closes</div>
<div id="loading" class="loading"><div class="loader"><span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span><strong>Preparing your story</strong><p>Preparing the opening artwork.</p></div></div></main>
<script>
(()=>{"use strict";const INPUT=${payload};const S=INPUT.session;const esc=(v)=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const img=(v)=>esc(v||S.heroArt[0]);const artOf=(m)=>m&&(m.banner||m.cover);const arts=(items)=>[...new Set((items||[]).map(artOf).filter(Boolean))].slice(0,5);
const posters=(items)=>items.slice(0,5).map((m,i)=>'<img class="poster" style="--r:'+(-18+i*9)+'deg;--x:'+(-115+i*58)+'px;--d:'+(i*.08)+'s" data-src="'+img(m.cover)+'" alt="'+esc(m.title)+' poster">').join('');
const shufflePosters=(items)=>items.slice(0,6).map(m=>'<img class="shuffle-poster" data-src="'+img(m.cover)+'" alt="'+esc(m.title)+' poster">').join('');
const studioNameClass=(name)=>{const length=String(name||"").trim().length;return length>22?"studio-name long":length>14?"studio-name medium":"studio-name"};
const slides=[];const add=(kind,artCandidates,html,duration=6800)=>{const candidates=(Array.isArray(artCandidates)?artCandidates:[artCandidates]).filter(Boolean);slides.push({kind,arts:candidates.length?[...new Set(candidates)].slice(0,5):S.heroArt.slice(0,5),html,duration})};
const periodHeadline=INPUT.periodHeadline;
add('intro',arts(S.watched).length?arts(S.watched):S.heroArt,'<div class="slide-inner"><div class="reveal"><div class="eyebrow">Seanime Wrapped</div><h1 class="display">Your '+esc(periodHeadline)+'<br><span class="gradient">in Anime</span></h1><div class="eyebrow">'+esc(S.period.label)+'</div><p class="subtitle">Let’s see what you’ve been watching '+esc(S.period.context)+'.</p></div></div>');
if(S.enabled.watched)add('watched',arts(S.watched),'<div class="slide-inner count-layout"><div class="count-copy reveal"><div class="eyebrow">You watched</div><div class="mega gradient" data-count="'+S.watched.length+'">0</div><h2>'+S.watched.length+' anime '+esc(S.period.context)+'</h2><p class="subtitle">Every title here is grounded in dated Seanime or AniList activity.</p></div><div class="posters">'+posters(S.watched)+'</div></div>');
if(S.genres.length){const g=S.genres[0],genreAnime=S.watched.filter(m=>m.genres.includes(g.name));add('genres',arts(genreAnime),'<div class="slide-inner genre-layout"><div class="reveal"><div class="eyebrow">Your most watched genre was</div><div class="genre-name gradient">'+esc(g.name.toUpperCase())+'</div><div class="donut" style="--p:'+g.percentage+'" data-label="'+g.percentage+'%"></div></div><div class="bars">'+S.genres.map(x=>'<div class="bar-row"><b>'+esc(x.name)+'</b><div class="bar-track"><div class="bar-fill" style="--w:'+x.percentage+'%"></div></div><span>'+x.percentage+'%</span></div>').join('')+'</div></div>');}
S.topFive.slice().reverse().forEach((m)=>add('rank '+(m.rank===1?'winner':''),[artOf(m)],'<div class="slide-inner rank-layout"><img class="rank-poster" style="--accent:'+esc(m.color)+'" data-src="'+img(m.cover)+'" alt="'+esc(m.title)+' poster"><div class="reveal" style="--accent:'+esc(m.color)+'"><div class="eyebrow">Your Top 5 Anime</div><div class="rank-number">#'+m.rank+'</div><h2 class="rank-title" title="'+esc(m.title)+'">'+esc(m.title)+'</h2><p class="subtitle">'+esc(m.metric)+'</p></div></div>',m.rank===1?8200:5600));
if(S.topFive.length)add('overview',arts(S.topFive),'<div class="slide-inner overview"><div style="width:100%"><div class="reveal"><div class="eyebrow">The full ranking</div><h2 style="font-size:clamp(40px,5vw,74px);margin:8px 0 28px">Your Top '+S.topFive.length+'</h2></div><div class="overview-grid">'+S.topFive.map((m,i)=>'<article class="overview-card '+(m.rank===1?'winner-card':'')+'" style="--d:'+(i*.1)+'s"><span class="card-rank">#'+m.rank+'</span><img data-src="'+img(m.cover)+'" alt=""><div class="card-copy"><div class="card-title">'+esc(m.title)+'</div><div class="meta rank-metric">'+esc(m.metric)+'</div></div></article>').join('')+'</div></div></div>',7800);
if(S.enabled.ratings&&S.highestRated)add('rated',[artOf(S.highestRated)],'<div class="slide-inner spotlight"><div class="spotlight-copy reveal"><div class="eyebrow">Your highest rated anime</div><h2 class="spotlight-title" title="'+esc(S.highestRated.title)+'">'+esc(S.highestRated.title)+'</h2><div class="score gradient">'+(INPUT.scoreLabels.highestRated===null?'—':INPUT.scoreLabels.highestRated)+'<small> / 10</small></div><p class="subtitle">'+esc((S.highestRated.genres||[]).slice(0,3).join(' · '))+(S.highestRatedStudio?' · '+esc(S.highestRatedStudio):'')+' · '+esc(S.highestRated.progress)+' episodes progress</p></div><div class="hero-card"><img data-src="'+img(S.highestRated.cover)+'" alt="'+esc(S.highestRated.title)+' poster"><div class="hero-details"><b>Your score</b><div>'+(INPUT.scoreLabels.highestRated===null?'—':INPUT.scoreLabels.highestRated)+'/10</div></div></div></div>');
if(S.topStudio)add('studio',arts(S.topStudio.anime),'<div class="slide-inner"><div class="studio-wall">'+S.topStudio.anime.slice(0,8).map(m=>'<img data-src="'+img(m.cover)+'" alt="">').join('')+'</div><div class="reveal studio-copy"><div class="eyebrow">You spent the most progress with</div><div class="'+studioNameClass(S.topStudio.name)+' gradient" title="'+esc(S.topStudio.name)+'">'+esc(S.topStudio.name)+'</div><p class="subtitle">Based on studio metadata available for your most engaged titles.</p><div class="compact-posters">'+S.topStudio.anime.slice(0,6).map(m=>'<img data-src="'+img(m.cover)+'" alt="'+esc(m.title)+'">').join('')+'</div></div></div>');
if(S.enabled.completed)add('completed',arts(S.completed),'<div class="slide-inner count-layout"><div class="count-copy reveal"><div class="eyebrow">You completed</div><div class="mega gradient" data-count="'+S.completed.length+'">0</div><h2>'+S.completed.length+' anime '+esc(S.period.context)+'</h2></div><div class="shuffle-deck">'+shufflePosters(S.completed)+'</div></div>',INPUT.completedDuration);
if(S.enabled.ratings)add('average',S.highestRated?[artOf(S.highestRated)]:S.heroArt,'<div class="slide-inner final"><div class="reveal"><div class="eyebrow">Your average score</div><div class="display gradient">'+(INPUT.scoreLabels.average===null?'—':INPUT.scoreLabels.average)+'</div><p class="subtitle" style="margin:auto">'+(S.averageScore===null?'No anime in this period had a user score. That’s okay—your recap stays honest.':'Calculated only from scores you gave, never AniList community scores.')+'</p></div></div>');
if(S.activeDay)add('day',arts(S.watched),'<div class="slide-inner"><div class="reveal"><div class="eyebrow">Your most active saved-watch weekday</div><h2 class="display gradient">'+esc(S.activeDay.label)+'</h2><p class="subtitle">'+S.activeDay.count+' title'+(S.activeDay.count===1?'':'s')+' had their latest saved watch record on this weekday.</p><p class="meta" style="max-width:620px;margin-top:25px">'+esc(S.activeDay.interpretation)+'</p></div></div>');
if(S.enabled.recommendations&&S.recommendations.length)add('recommend',arts(S.recommendations),'<div class="slide-inner recommend"><div style="width:100%"><div class="recommend-head"><div><div class="eyebrow">What comes next</div><h2>Most likely next watch</h2></div><span class="meta">Taste-fit shortlist</span></div><div class="rec-grid">'+S.recommendations.map((m,i)=>'<button type="button" class="rec-card" data-media-id="'+m.mediaId+'" aria-label="Open '+esc(m.title)+' in Seanime" style="--i:'+i+'"><span class="rec-rank">'+(i+1)+'</span><img data-src="'+img(m.cover)+'" alt=""><div class="rec-copy"><b>'+esc(m.title)+'</b><span class="rec-rating">★ '+(m.globalScore?(m.globalScore/10).toFixed(1):'—')+' AniList</span><span class="reason">'+esc(m.reason)+'</span></div></button>').join('')+'</div></div></div>',10000);
add('final',arts(S.topFive),'<div class="slide-inner final"><div class="reveal"><div class="eyebrow">'+esc(S.period.label)+' in a nutshell</div><h1>That was your<br><span class="gradient">Seanime Wrapped</span></h1><div class="summary">'+S.summary.map(x=>'<div>'+esc(x)+'</div>').join('')+'</div><div class="thanks">Thanks for watching.</div></div></div>',12000);
const FALLBACK="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 675'%3E%3Cdefs%3E%3ClinearGradient id='g'%3E%3Cstop stop-color='%234c5cff'/%3E%3Cstop offset='.55' stop-color='%23bd42d8'/%3E%3Cstop offset='1' stop-color='%23101525'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='675' fill='%23070a14'/%3E%3Ccircle cx='380' cy='270' r='330' fill='url(%23g)' opacity='.8'/%3E%3C/svg%3E";const PAUSE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',PLAY_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path class="filled" d="m8 5 11 7-11 7z"/></svg>';const MAX_PRELOAD_AHEAD=2;const failedArt=new Set(),artLoads=new Map(),handledKeys=new WeakSet();const app=document.getElementById('app'),stage=document.getElementById('stage'),progress=document.getElementById('progress'),loading=document.getElementById('loading'),pause=document.getElementById('pause');let index=0,paused=!INPUT.settings.autoAdvance,elapsed=0,last=0,raf=0,closed=false,openingAnime=false,bgFlip=false,backgroundIndex=0,shuffleCycle=-1;let effectRafs=[];
stage.innerHTML=slides.map((s,i)=>'<article class="slide '+esc(s.kind)+'" data-index="'+i+'">'+s.html+'</article>').join('');progress.innerHTML=slides.map(()=>'<span class="segment"><i></i></span>').join('');
function requestEffect(fn){const id=requestAnimationFrame(t=>{effectRafs=effectRafs.filter(value=>value!==id);fn(t)});effectRafs.push(id);return id}function clearEffects(){effectRafs.forEach(cancelAnimationFrame);effectRafs=[]}function resolvedArt(url){return !url||failedArt.has(url)?FALLBACK:url}function setBackground(url){const incoming=document.getElementById(bgFlip?'bgA':'bgB'),outgoing=document.getElementById(bgFlip?'bgB':'bgA');const clean=String(resolvedArt(url)).split('"').join('').split(String.fromCharCode(92)).join('');incoming.style.backgroundImage='url("'+clean+'")';incoming.classList.add('active');outgoing.classList.remove('active');bgFlip=!bgFlip}
function loadArtwork(url){const source=String(url||'');if(!source||failedArt.has(source))return Promise.resolve(FALLBACK);if(artLoads.has(source))return artLoads.get(source);const pending=new Promise(resolve=>{const image=new Image();const finish=(result)=>{clearTimeout(timer);image.onload=null;image.onerror=null;resolve(result)};const timer=setTimeout(()=>{failedArt.add(source);image.src='';finish(FALLBACK)},6000);image.onload=()=>finish(source);image.onerror=()=>{failedArt.add(source);finish(FALLBACK)};image.src=source});artLoads.set(source,pending);return pending}
function prepareSlide(slideIndex){const record=slides[slideIndex],root=document.querySelector('.slide[data-index="'+slideIndex+'"]');if(!record||!root)return Promise.resolve();const images=[...root.querySelectorAll('img[data-src]')];return Promise.all([...record.arts.map(loadArtwork),...images.map(image=>loadArtwork(image.dataset.src))]).then(results=>{const offset=record.arts.length;images.forEach((image,i)=>{image.src=results[offset+i]||FALLBACK;image.removeAttribute('data-src');image.addEventListener('error',()=>{image.src=FALLBACK},{once:true})})})}
function primeWindow(center){const pending=[];for(let offset=0;offset<=MAX_PRELOAD_AHEAD;offset++){const slideIndex=center+offset;if(slideIndex<slides.length)pending.push(prepareSlide(slideIndex))}return Promise.all(pending)}
function countUp(root){clearEffects();root.querySelectorAll('[data-count]').forEach(el=>{const target=Number(el.dataset.count||0);if(matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=target;return}const start=performance.now();const step=t=>{if(closed)return;const p=Math.min(1,(t-start)/900);el.textContent=Math.round(target*(1-Math.pow(1-p,3)));if(p<1)requestEffect(step)};requestEffect(step)})}
function shuffleCompleted(root,cycle){const posters=[...root.querySelectorAll('.shuffle-poster')],count=posters.length;if(!count)return;posters.forEach((poster,i)=>{const slot=(i+cycle)%count,position=count===1?50:8+(slot*84/(count-1)),foreground=slot===Math.floor((count-1)/2);poster.style.left=position+'%';poster.style.zIndex=String(foreground?20:slot+1);poster.style.filter=foreground?'brightness(1.08)':'brightness(.72)';poster.style.transform='translate(-50%,-50%) rotate('+(slot-(count-1)/2)*4+'deg) scale('+(foreground?1.1:.9)+')'})}
function show(next){index=Math.max(0,Math.min(slides.length-1,next));elapsed=0;last=performance.now();backgroundIndex=0;shuffleCycle=-1;primeWindow(index);document.querySelectorAll('.slide').forEach((el,i)=>el.classList.toggle('active',i===index));setBackground(slides[index].arts[0]);const root=document.querySelector('.slide[data-index="'+index+'"]');countUp(root);if(slides[index].kind==='completed'){shuffleCycle=0;shuffleCompleted(root,0)}updateProgress(0)}
function updateProgress(frac){[...progress.children].forEach((seg,i)=>seg.firstElementChild.style.width=(i<index?100:i>index?0:frac*100)+'%')}
function updatePause(){pause.innerHTML=paused?PLAY_ICON:PAUSE_ICON;pause.setAttribute('aria-label',paused?'Resume auto-advance':'Pause auto-advance')}
function tick(now){if(closed)return;if(!last)last=now;if(!paused){elapsed+=now-last;const slide=slides[index],cycle=Math.floor(elapsed/3000);if(slide.arts.length>1&&cycle!==backgroundIndex){backgroundIndex=cycle%slide.arts.length;setBackground(slide.arts[backgroundIndex])}if(slide.kind==='completed'&&cycle!==shuffleCycle){shuffleCycle=cycle;shuffleCompleted(document.querySelector('.slide[data-index="'+index+'"]'),cycle)}const fraction=Math.min(1,elapsed/slide.duration);updateProgress(fraction);if(fraction>=1&&index<slides.length-1){show(index+1)}else if(fraction>=1){paused=true;updatePause()}}last=now;raf=requestAnimationFrame(tick)}
function togglePause(){paused=!paused;updatePause();last=performance.now()}
function focusViewer(){window.focus();try{app.focus({preventScroll:true})}catch{app.focus()}}
function cleanup(){cancelAnimationFrame(raf);clearEffects();document.removeEventListener('keydown',onKey,true);window.removeEventListener('keydown',onKey);app.removeEventListener('click',focusViewer,true);stage.removeEventListener('click',onStage)}
function close(){if(closed)return;closed=true;app.classList.add('closing');cleanup();window.webview?.send('close',{})}
function onKey(e){if(handledKeys.has(e))return;if(e.target.closest?.('.rec-card')&&(e.key==='Enter'||e.code==='Space'||e.key===' '))return;handledKeys.add(e);if(e.key==='ArrowRight'){e.preventDefault();show(index+1)}else if(e.key==='ArrowLeft'){e.preventDefault();show(index-1)}else if(e.key==='Escape'){e.preventDefault();close()}else if(e.code==='Space'||e.key===' '){e.preventDefault();togglePause()}}
function onStage(e){const card=e.target.closest('.rec-card');if(card){const mediaId=Number(card.dataset.mediaId||0);if(mediaId>0&&!openingAnime){openingAnime=true;paused=true;updatePause();window.webview?.send('open-anime',{mediaId});setTimeout(()=>{openingAnime=false},1000)}return}if(e.target.closest('button'))return;show(index+(e.clientX<innerWidth/2?-1:1))}
document.getElementById('close').addEventListener('click',close);pause.addEventListener('click',togglePause);document.addEventListener('keydown',onKey,true);window.addEventListener('keydown',onKey);app.addEventListener('click',focusViewer,true);stage.addEventListener('click',onStage);window.addEventListener('pagehide',cleanup,{once:true});window.focus();updatePause();
primeWindow(0).then(()=>{loading.classList.add('hidden');show(0);focusViewer();raf=requestAnimationFrame(tick)});
})();
</script></body></html>`;
    }
    return { documentFor, completedSlideDuration };
}
const SHARED_DOMAIN = "seanime-wrapped/domain/v1";
const SHARED_VIEWER = "seanime-wrapped/viewer/v1";
function init() {
    $shared.define(SHARED_DOMAIN, createDomain);
    $shared.define(SHARED_VIEWER, createViewer);
    $ui.register((ctx) => {
        const domain = $shared.use("seanime-wrapped/domain/v1");
        const viewerBuilder = $shared.use("seanime-wrapped/viewer/v1");
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
        const defaults = {
            period: "month",
            includeWatched: true,
            includeCompleted: true,
            includeRatings: true,
            recommendations: true,
            autoAdvance: true
        };
        function loadSettings() {
            try {
                const stored = $storage.get(SETTINGS_KEY) || {};
                return { ...defaults, ...stored };
            }
            catch {
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
        const lastGenerated = ctx.state($storage.get(LAST_GENERATED_KEY) || "");
        const periodRef = ctx.fieldRef(settings.period);
        const watchedRef = ctx.fieldRef(settings.includeWatched);
        const completedRef = ctx.fieldRef(settings.includeCompleted);
        const ratingsRef = ctx.fieldRef(settings.includeRatings);
        const recommendationsRef = ctx.fieldRef(settings.recommendations);
        const autoAdvanceRef = ctx.fieldRef(settings.autoAdvance);
        function formatGeneratedAt(value) {
            const date = new Date(value);
            if (!Number.isFinite(date.getTime()))
                return "an unknown time";
            const pad = (part) => String(part).padStart(2, "0");
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }
        function saveSettings() {
            settings = {
                period: periodRef.current,
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
        viewer.channel.on("open-anime", (payload) => {
            const mediaId = Number(typeof payload === "number" ? payload : payload?.mediaId || 0);
            if (!Number.isFinite(mediaId) || mediaId <= 0 || animeNavigationPending)
                return;
            animeNavigationPending = true;
            viewerOpen = false;
            viewer.hide();
            ctx.setTimeout(() => {
                try {
                    ctx.screen.navigateTo("/entry", { id: String(mediaId) });
                }
                catch (cause) {
                    console.warn("Seanime Wrapped could not open the anime entry", cause);
                    viewer.show();
                    viewerOpen = true;
                    ctx.toast.warning("The anime page could not be opened. Wrapped is still available.");
                }
                finally {
                    animeNavigationPending = false;
                }
            }, 100);
        });
        viewer.onUnmount(() => { viewerOpen = false; });
        function normalizeDetail(mediaId, detail) {
            const recommendations = [];
            for (const edge of detail?.recommendations?.edges || []) {
                const media = edge?.node?.mediaRecommendation;
                if (media?.id)
                    recommendations.push(domain.mediaFromBase(media));
            }
            const relations = [];
            for (const edge of detail?.relations?.edges || []) {
                if (edge?.node?.id)
                    relations.push(domain.mediaFromBase(edge.node));
            }
            return {
                studioNames: (detail?.studios?.nodes || []).map((studio) => String(studio?.name || "")).filter(Boolean),
                recommendations,
                relations
            };
        }
        function collectAniListActivity(period) {
            if (period.start === null)
                return [];
            try {
                const rawUsername = $database.anilist.getUsername();
                const username = rawUsername ? String(rawUsername) : "";
                if (!username)
                    return [];
                if (username !== activityUsername || !activityUserId) {
                    const userResult = $anilist.customQuery({
                        query: "query WrappedActivityUser($name: String) { User(name: $name) { id } }",
                        variables: { name: username }
                    }, "");
                    activityUsername = username;
                    activityUserId = Number(userResult?.User?.id || 0);
                }
                if (!activityUserId)
                    return [];
                const activities = [];
                for (let page = 1; page <= 4; page++) {
                    const result = $anilist.customQuery({
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
                        if (!mediaId || !createdAt)
                            continue;
                        activities.push({
                            mediaId,
                            createdAt,
                            status: String(activity?.status || ""),
                            progress: activity?.progress == null ? null : String(activity.progress)
                        });
                    }
                    if (!result?.Page?.pageInfo?.hasNextPage)
                        break;
                }
                return activities;
            }
            catch (cause) {
                console.warn("Seanime Wrapped AniList activity unavailable", cause);
                return [];
            }
        }
        function collectMetadata(preliminary) {
            const stored = forceRefresh ? {} : ($storage.get(DETAIL_CACHE_KEY) || {});
            const cache = {};
            for (const key of Object.keys(stored))
                cache[Number(key)] = stored[key];
            const prioritized = [
                ...preliminary.topFive,
                ...preliminary.watched.slice().sort((a, b) => b.progress - a.progress || a.mediaId - b.mediaId)
            ];
            const ids = Array.from(new Set(prioritized.map((media) => media.mediaId))).slice(0, 15);
            let failures = 0;
            for (const mediaId of ids) {
                if (cache[mediaId] && !forceRefresh)
                    continue;
                try {
                    cache[mediaId] = normalizeDetail(mediaId, $anilist.getAnimeDetails(mediaId));
                }
                catch (cause) {
                    failures += 1;
                    console.warn("Seanime Wrapped metadata unavailable", mediaId, cause);
                }
            }
            try {
                $storage.set(DETAIL_CACHE_KEY, cache);
            }
            catch { }
            if (failures && failures === ids.length)
                ctx.toast.warning("Detailed studio/recommendation metadata was unavailable; the recap will continue with cached collection data.");
            return cache;
        }
        function collectRelationMetadata(cache, preliminary) {
            if (!settings.recommendations)
                return;
            const planningCount = preliminary.recommendations.length;
            if (planningCount >= 10)
                return;
            try {
                const collection = $anilist.getAnimeCollectionWithRelations();
                for (const list of collection?.MediaListCollection?.lists || []) {
                    for (const entry of list?.entries || []) {
                        const id = Number(entry?.media?.id || 0);
                        if (!id || !entry?.media?.relations?.edges?.length)
                            continue;
                        const current = cache[id] || { studioNames: [], recommendations: [], relations: [] };
                        current.relations = entry.media.relations.edges.map((edge) => edge?.node).filter((media) => Boolean(media?.id)).map((media) => domain.mediaFromBase(media));
                        cache[id] = current;
                    }
                }
            }
            catch (cause) {
                console.warn("Seanime Wrapped relation collection unavailable", cause);
            }
        }
        function enrichRecommendationRatings(session) {
            const cache = forceRefresh ? {} : ($storage.get(RATING_CACHE_KEY) || {});
            const now = Date.now();
            const missing = session.recommendations.filter((media) => {
                if (media.globalScore !== null && media.globalScore > 0)
                    return false;
                const hit = cache[String(media.mediaId)];
                if (hit && now - hit.at < 7 * 86400000) {
                    media.globalScore = hit.score;
                    return false;
                }
                return true;
            });
            if (!missing.length)
                return;
            try {
                // Native customQuery returns the unwrapped GraphQL data object. Public
                // community scores need no token; one request covers at most ten IDs.
                const result = $anilist.customQuery({
                    query: "query WrappedRatings($ids: [Int]) { Page(page: 1, perPage: 10) { media(id_in: $ids, type: ANIME) { id meanScore } } }",
                    variables: { ids: missing.map((media) => media.mediaId) }
                }, "");
                for (const item of result?.Page?.media || []) {
                    const score = domain.mediaFromBase(item).globalScore;
                    cache[String(item.id)] = { score: score && score > 0 ? score : null, at: now };
                    const candidate = missing.find((media) => media.mediaId === Number(item.id));
                    if (candidate)
                        candidate.globalScore = cache[String(item.id)].score;
                }
                $storage.set(RATING_CACHE_KEY, cache);
            }
            catch {
                // Failed requests are not negative-cached, so the next session retries.
                ctx.toast.warning("Some AniList community ratings are temporarily unavailable.");
            }
        }
        function updateLoading(stage, progress) {
            loadingStage.set(stage);
            loadingProgress.set(progress);
            tray.update();
        }
        function failGeneration(cause) {
            const message = cause instanceof Error ? cause.message : String(cause || "Unknown error");
            error.set(message.includes("rate") ? "AniList is rate-limited right now. Cached data was insufficient; please try again later." : message);
            loading.set(false);
            loadingStage.set("");
            loadingProgress.set(0);
            tray.update();
            ctx.toast.error(error.get());
        }
        function later(fn, delay = 45) {
            ctx.setTimeout(() => {
                try {
                    fn();
                }
                catch (cause) {
                    failGeneration(cause);
                }
            }, delay);
        }
        function startWrapped() {
            if (loading.get())
                return;
            saveSettings();
            loading.set(true);
            error.set("");
            updateLoading("Reading your anime library…", 8);
            later(() => {
                // Wrapped statistics are always rebuilt from a current collection.
                // Seanime's bypass flag prevents a prior in-memory AniList snapshot
                // from freezing progress, completion status, or user scores.
                const collection = $anilist.getRawAnimeCollection(true);
                if (DEBUG_SCORES)
                    console.warn("Wrapped score diagnostics", JSON.stringify(domain.scoreDiagnostics(collection)));
                const history = ctx.continuity.getWatchHistory();
                const all = domain.normalizeCollection(collection, history);
                if (!all.length)
                    throw new Error("No anime collection data is available. Connect AniList or add anime to your local account first.");
                const generationNow = Date.now();
                const period = domain.periodFor(settings.period, generationNow);
                const listActivities = collectAniListActivity(period);
                const previousSnapshot = $storage.get(SOURCE_SNAPSHOT_KEY) || {};
                const sourceSnapshot = domain.buildSourceSnapshot(all, previousSnapshot, listActivities, generationNow);
                const activityContext = { snapshot: sourceSnapshot, listActivities };
                const sourceRevision = domain.sourceRevision(all);
                const previousRevision = $storage.get(SOURCE_REVISION_KEY) || "";
                if (sourceRevision !== previousRevision) {
                    try {
                        $storage.remove(LAST_SESSION_KEY);
                    }
                    catch { }
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
            if (loading.get())
                return;
            try {
                $storage.remove(DETAIL_CACHE_KEY);
                $storage.remove(RATING_CACHE_KEY);
                $storage.remove(LAST_SESSION_KEY);
                $storage.remove(SOURCE_REVISION_KEY);
            }
            catch { }
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
        tray.onClose(() => { });
    });
}
