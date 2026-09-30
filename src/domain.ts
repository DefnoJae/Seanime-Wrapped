export type PeriodKey = "month" | "previous-month" | "last-3" | "last-6" | "ytd" | "full-year" | "all-time";

export interface WrappedSettings {
  period: PeriodKey;
  includeWatched: boolean;
  includeCompleted: boolean;
  includeRatings: boolean;
  recommendations: boolean;
  autoAdvance: boolean;
}

export interface MediaRecord {
  mediaId: number;
  mediaType: string | null;
  title: string;
  cover: string;
  banner: string;
  color: string;
  genres: string[];
  globalScore: number | null;
  userScore: number | null;
  status: string;
  progress: number;
  episodes: number | null;
  duration: number | null;
  updatedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  historyAt: number | null;
  historyEpisode: number | null;
}

export interface SourceSnapshotItem {
  status: string;
  progress: number;
  userScore: number | null;
  updatedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  historyAt: number | null;
  historyEpisode: number | null;
  observedProgressAt: number | null;
  observedCompletionAt: number | null;
}

export type SourceSnapshot = Record<number, SourceSnapshotItem>;

export interface AniListListActivity {
  mediaId: number;
  createdAt: number;
  status: string;
  progress: string | null;
}

export type PeriodEvidenceSource =
  | "all-time-current-state"
  | "seanime-history"
  | "anilist-start-date"
  | "anilist-completion-date"
  | "anilist-list-activity"
  | "observed-status-transition"
  | "observed-progress-transition"
  | "controlled-updated-at"
  | "no-dated-evidence";

export interface PeriodActivityDecision {
  mediaId: number;
  watched: boolean;
  completed: boolean;
  sources: PeriodEvidenceSource[];
}

export interface PeriodActivityContext {
  snapshot?: SourceSnapshot;
  listActivities?: AniListListActivity[];
}

export interface StudioMetadata {
  studioNames: string[];
  recommendations: MediaRecord[];
  relations: MediaRecord[];
}

export interface RankedMedia extends MediaRecord {
  rank: number;
  engagementScore: number;
  metric: string;
}

export interface Recommendation extends MediaRecord {
  reason: string;
  affinityScore: number;
  sourceRank: number;
  sourceMediaId: number;
}

export interface GenreStat {
  name: string;
  count: number;
  percentage: number;
}

export interface WrappedSession {
  version: 1;
  generatedAt: string;
  period: { key: PeriodKey; label: string; context: string; start: number | null; end: number };
  accuracyNote: string;
  watched: MediaRecord[];
  completed: MediaRecord[];
  topFive: RankedMedia[];
  highestRated: MediaRecord | null;
  highestRatedStudio: string | null;
  genres: GenreStat[];
  topStudio: { name: string; anime: MediaRecord[] } | null;
  averageScore: number | null;
  activeDay: { label: string; count: number; interpretation: string } | null;
  recommendations: Recommendation[];
  heroArt: string[];
  summary: string[];
  enabled: {
    watched: boolean;
    completed: boolean;
    ratings: boolean;
    recommendations: boolean;
  };
}

export function createDomain() {
  const fallbackArt = "https://raw.githubusercontent.com/DefnoJae/Seanime-Wrapped/main/assets/fallback.svg";
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function numberOrNull(value: unknown): number | null {
    // Goja can expose pointer-backed primitives as boxed host values.
    if (value !== null && typeof value === "object" && typeof value.valueOf === "function") {
      const primitive = value.valueOf();
      if (typeof primitive === "number" || typeof primitive === "string") value = primitive;
    }
    if (typeof value === "string") {
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
      value = Number(value);
    }
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  // The upstream JSON field is score; Goja also exposes GetScore as getScore.
  function scoreValue(entry: any): unknown {
    return entry?.score ?? (typeof entry?.getScore === "function" ? entry.getScore() : null);
  }

  function extractUserScore(entry: any): number | null {
    const score = numberOrNull(scoreValue(entry));
    if (score === null || score <= 0 || score > 100) return null;
    // Compatibility for normalized adapters. Values <=10 are ambiguous without
    // format metadata; preserve them per the plugin's 0-10 adapter contract.
    return score > 10 ? score / 10 : score;
  }

  function scoreDiagnostics(collection: any) {
    let entries = 0, rated = 0;
    const shapes: Record<string, number> = {};
    for (const list of collection?.MediaListCollection?.lists || []) {
      for (const entry of list?.entries || []) {
        entries++;
        const value = scoreValue(entry), numeric = numberOrNull(value);
        if (extractUserScore(entry) !== null) rated++;
        const field = entry?.score != null ? "score" : typeof entry?.getScore === "function" ? "getScore()" : "missing";
        const shape = `${field}:${value === null ? "null" : typeof value}:${numeric === null ? "missing/invalid" : numeric <= 0 ? "zero/negative" : numeric <= 10 ? "1-10" : "11-100"}`;
        shapes[shape] = (shapes[shape] || 0) + 1;
      }
    }
    return { entries, rated, shapes };
  }

  function timestamp(value: unknown): number | null {
    const numeric = numberOrNull(value);
    if (numeric !== null) return numeric > 1e12 ? numeric : numeric * 1000;
    if (typeof value !== "string" || !value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function fuzzyDate(value: any): number | null {
    if (!value || !value.year) return null;
    return new Date(Number(value.year), Math.max(0, Number(value.month || 1) - 1), Number(value.day || 1), 12).getTime();
  }

  function titleOf(media: any): string {
    return media?.title?.userPreferred || media?.title?.english || media?.title?.romaji || media?.title?.native || `Anime #${media?.id || "?"}`;
  }

  function mediaTypeOf(media: any): string | null {
    let value = media?.type ?? (typeof media?.getType === "function" ? media.getType() : null);
    if (value !== null && typeof value === "object" && typeof value.valueOf === "function") value = value.valueOf();
    if (typeof value !== "string" || !value.trim()) return null;
    return value.trim().toUpperCase();
  }

  function mediaFromBase(media: any, entry?: any, history?: any): MediaRecord {
    return {
      mediaId: Number(media?.id || history?.mediaId || 0),
      mediaType: mediaTypeOf(media),
      title: titleOf(media),
      cover: media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || fallbackArt,
      banner: media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || fallbackArt,
      color: media?.coverImage?.color || "#8b5cf6",
      genres: Array.isArray(media?.genres) ? media.genres.map((genre: any) => genre?.valueOf()).filter((genre: unknown) => typeof genre === "string") : [],
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

  function normalizeCollection(collection: any, watchHistory: Record<number, any>): MediaRecord[] {
    const byId: Record<number, MediaRecord> = {};
    const lists = collection?.MediaListCollection?.lists || [];
    for (const list of lists) {
      for (const entry of list?.entries || []) {
        const media = entry?.media;
        const id = Number(media?.id || 0);
        if (!id) continue;
        const normalized = mediaFromBase(media, entry, watchHistory[id]);
        const existing = byId[id];
        if (!existing) byId[id] = normalized;
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

  function sourceRevision(all: MediaRecord[]): string {
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

  function listActivityKind(activity: AniListListActivity): { watched: boolean; completed: boolean } {
    const status = String(activity.status || "").toLowerCase();
    const progress = String(activity.progress || "").toLowerCase();
    const completed = status.includes("completed");
    const watched = completed || status.includes("watched episode") || status.includes("rewatched episode") || /\d/.test(progress);
    return { watched, completed };
  }

  function buildSourceSnapshot(all: MediaRecord[], previous: SourceSnapshot = {}, listActivities: AniListListActivity[] = [], observedAt?: number): SourceSnapshot {
    const now = observedAt || Date.now();
    const activitiesById: Record<number, AniListListActivity[]> = {};
    for (const activity of listActivities) (activitiesById[activity.mediaId] ||= []).push(activity);
    const snapshot: SourceSnapshot = {};
    for (const media of all) {
      const prior = previous[media.mediaId];
      const updatedTransitionAt = media.updatedAt && (!prior?.updatedAt || media.updatedAt > prior.updatedAt) ? media.updatedAt : now;
      let observedProgressAt = prior?.observedProgressAt || null;
      let observedCompletionAt = prior?.observedCompletionAt || null;
      if (prior && media.progress > prior.progress) observedProgressAt = updatedTransitionAt;
      if (prior && prior.status !== "COMPLETED" && media.status === "COMPLETED") {
        observedProgressAt = updatedTransitionAt;
        observedCompletionAt = updatedTransitionAt;
      }
      for (const activity of activitiesById[media.mediaId] || []) {
        const kind = listActivityKind(activity);
        if (kind.watched && (!observedProgressAt || activity.createdAt > observedProgressAt)) observedProgressAt = activity.createdAt;
        if (kind.completed && (!observedCompletionAt || activity.createdAt > observedCompletionAt)) observedCompletionAt = activity.createdAt;
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

  function periodFor(key: PeriodKey, nowValue?: number) {
    const now = new Date(nowValue || Date.now());
    const end = now.getTime();
    const monthName = MONTHS[now.getMonth()];
    if (key === "all-time") return { key, label: "All Time", context: "across your anime journey", start: null, end };
    if (key === "month") return { key, label: `${monthName} ${now.getFullYear()}`, context: "this month", start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end };
    if (key === "previous-month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const stop = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
      return { key, label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`, context: "that month", start: start.getTime(), end: stop };
    }
    if (key === "last-3" || key === "last-6") {
      const months = key === "last-3" ? 3 : 6;
      return { key, label: `Your Last ${months} Months`, context: `over the last ${months} months`, start: new Date(now.getFullYear(), now.getMonth() - months + 1, 1).getTime(), end };
    }
    if (key === "ytd") return { key, label: `${now.getFullYear()} So Far`, context: "this year", start: new Date(now.getFullYear(), 0, 1).getTime(), end };
    const year = now.getFullYear() - 1;
    return { key, label: `${year}`, context: `in ${year}`, start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() - 1 };
  }

  function inWindow(value: number | null, period: ReturnType<typeof periodFor>): boolean {
    if (!value) return false;
    return (period.start === null || value >= period.start) && value <= period.end;
  }

  function periodActivity(all: MediaRecord[], period: ReturnType<typeof periodFor>, context: PeriodActivityContext = {}): PeriodActivityDecision[] {
    if (period.start === null) return all.map((media) => ({
      mediaId: media.mediaId,
      watched: media.progress > 0 || media.status === "COMPLETED" || media.historyAt !== null,
      completed: media.status === "COMPLETED",
      sources: ["all-time-current-state"]
    }));
    const activitiesById: Record<number, AniListListActivity[]> = {};
    for (const activity of context.listActivities || []) {
      if (inWindow(activity.createdAt, period)) (activitiesById[activity.mediaId] ||= []).push(activity);
    }
    const strongEvidence = (media: MediaRecord): boolean => {
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
      const sources: PeriodEvidenceSource[] = [];
      let watched = false, completed = false;
      if (inWindow(media.historyAt, period)) {
        watched = true;
        sources.push("seanime-history");
        const atEnd = media.episodes !== null && media.episodes > 0 && Math.max(media.progress, media.historyEpisode || 0) >= media.episodes;
        if (media.status === "COMPLETED" && atEnd) completed = true;
      }
      if (inWindow(media.startedAt, period)) { watched = true; sources.push("anilist-start-date"); }
      if (inWindow(media.completedAt, period)) {
        watched = true;
        completed = media.status === "COMPLETED";
        sources.push("anilist-completion-date");
      }
      if (activities.some((activity) => listActivityKind(activity).watched)) {
        watched = true;
        if (activities.some((activity) => listActivityKind(activity).completed) && media.status === "COMPLETED") completed = true;
        sources.push("anilist-list-activity");
      }
      if (inWindow(snapshot?.observedCompletionAt || null, period)) {
        watched = true;
        completed = media.status === "COMPLETED";
        sources.push("observed-status-transition");
      } else if (inWindow(snapshot?.observedProgressAt || null, period)) {
        watched = true;
        sources.push("observed-progress-transition");
      }
      if (fallbackIds.has(media.mediaId)) {
        watched = true;
        completed = true;
        sources.push("controlled-updated-at");
      }
      if (!sources.length) sources.push("no-dated-evidence");
      if (completed) watched = true;
      return { mediaId: media.mediaId, watched, completed, sources };
    });
  }

  function engagement(media: MediaRecord, period: ReturnType<typeof periodFor>): number {
    const progress = Math.max(media.progress, media.historyEpisode || 0);
    const absolute = Math.min(Math.log1p(progress) / Math.log1p(100), 1);
    const completion = media.episodes && media.episodes > 0 ? Math.min(progress / media.episodes, 1) : absolute;
    const normalized = .85 * completion + .15 * absolute;
    return .6 * ((media.userScore || 0) / 10) + .4 * normalized;
  }

  function rankMedia(watched: MediaRecord[], period: ReturnType<typeof periodFor>): RankedMedia[] {
    return watched.slice().sort((a, b) => {
      const scoreDiff = engagement(b, period) - engagement(a, period);
      if (scoreDiff) return scoreDiff;
      const dateDiff = (b.historyAt || b.completedAt || b.startedAt || 0) - (a.historyAt || a.completedAt || a.startedAt || 0);
      return dateDiff || a.mediaId - b.mediaId;
    }).slice(0, 5).map((media, index) => ({
      ...media,
      rank: index + 1,
      engagementScore: engagement(media, period),
      metric: `${media.userScore ? `Your score ★ ${media.userScore.toFixed(1)} · ` : ""}${Math.max(media.progress, media.historyEpisode || 0)} episode${Math.max(media.progress, media.historyEpisode || 0) === 1 ? "" : "s"} progress`
    }));
  }

  function genreStats(watched: MediaRecord[]): GenreStat[] {
    const counts: Record<string, number> = {};
    for (const media of watched) for (const genre of media.genres) counts[genre] = (counts[genre] || 0) + 1;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
    return Object.keys(counts).map((name) => ({ name, count: counts[name], percentage: Math.round((counts[name] / total) * 100) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 6);
  }

  function topStudio(watched: MediaRecord[], details: Record<number, StudioMetadata>) {
    const weights: Record<string, number> = {};
    const mediaByStudio: Record<string, MediaRecord[]> = {};
    for (const media of watched) {
      const names = details[media.mediaId]?.studioNames || [];
      for (const name of names) {
        weights[name] = (weights[name] || 0) + Math.max(1, media.progress);
        (mediaByStudio[name] ||= []).push(media);
      }
    }
    const name = Object.keys(weights).sort((a, b) => weights[b] - weights[a] || a.localeCompare(b))[0];
    return name ? { name, anime: mediaByStudio[name].slice().sort((a, b) => b.progress - a.progress || a.mediaId - b.mediaId).slice(0, 8) } : null;
  }

  function activeDay(watched: MediaRecord[], period: ReturnType<typeof periodFor>) {
    const days: Record<string, number> = {};
    for (const media of watched) {
      if (!inWindow(media.historyAt, period)) continue;
      const label = WEEKDAYS[new Date(media.historyAt!).getDay()];
      days[label] = (days[label] || 0) + 1;
    }
    const entries = Object.keys(days).map((label) => ({ label, count: days[label] })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (!entries.length) return null;
    return { ...entries[0], interpretation: "Most titles whose latest saved watch activity falls on this weekday; not an episode-by-episode history." };
  }

  function recommendationPool(all: MediaRecord[], watched: MediaRecord[], details: Record<number, StudioMetadata>, discovery: MediaRecord[]): MediaRecord[] {
    const pool: MediaRecord[] = all.filter((media) => media.status === "PLANNING");
    for (const media of watched) {
      const detail = details[media.mediaId];
      if (detail) pool.push(...detail.recommendations, ...detail.relations);
    }
    pool.push(...discovery);
    const unique: Record<number, MediaRecord> = {};
    for (const media of pool) {
      if (!media.mediaId) continue;
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

  function recommend(all: MediaRecord[], topFive: RankedMedia[], details: Record<number, StudioMetadata>, discovery: MediaRecord[]): Recommendation[] {
    const excluded = new Set(all.filter((media) => media.status === "COMPLETED" || media.status === "CURRENT" || media.status === "DROPPED").map((media) => media.mediaId));
    const planning = new Set(all.filter((media) => media.status === "PLANNING").map((media) => media.mediaId));
    topFive.forEach((media) => excluded.add(media.mediaId));
    const candidates = recommendationPool(all, topFive, details, discovery)
      .filter((media) => media.mediaType === "ANIME" && !excluded.has(media.mediaId));
    const used = new Set<number>();
    const selected: Recommendation[] = [];
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
        if (count >= 2) break;
        if (used.has(candidate.media.mediaId)) continue;
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

  function buildSession(all: MediaRecord[], details: Record<number, StudioMetadata>, discovery: MediaRecord[], settings: WrappedSettings, nowValue?: number, activityContext: PeriodActivityContext = {}): WrappedSession {
    const period = periodFor(settings.period, nowValue);
    const evidence = periodActivity(all, period, activityContext);
    const mediaById: Record<number, MediaRecord> = {};
    for (const media of all) mediaById[media.mediaId] = media;
    const watched = settings.includeWatched ? evidence.filter((item) => item.watched).map((item) => mediaById[item.mediaId]) : [];
    const completed = settings.includeCompleted ? evidence.filter((item) => item.completed).map((item) => mediaById[item.mediaId]) : [];
    const ranked = rankMedia(watched, period);
    const genres = genreStats(watched);
    const studio = topStudio(watched, details);
    const relevantById: Record<number, MediaRecord> = {};
    for (const item of evidence) if (item.watched || item.completed) relevantById[item.mediaId] = mediaById[item.mediaId];
    const relevant = Object.keys(relevantById).map((id) => relevantById[Number(id)]);
    const scored = settings.includeRatings ? relevant.filter((media) => media.userScore !== null && media.userScore! > 0) : [];
    const averageScore = scored.length ? Math.round((scored.reduce((sum, media) => sum + media.userScore!, 0) / scored.length) * 10) / 10 : null;
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
    if (day) summary.push(`${day.label} had the most latest-watch records`);
    const heroArt = Array.from(new Set([
      ranked[0], watched[0], ranked[1], highestRated, studio?.anime[0], completed[0], recs[0]
    ].filter((media): media is MediaRecord => Boolean(media)).map((media) => media.banner || media.cover).filter(Boolean))).slice(0, 8);
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

export type WrappedDomain = ReturnType<typeof createDomain>;
