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

  function selectedMedia(all: MediaRecord[], period: ReturnType<typeof periodFor>): MediaRecord[] {
    if (period.start === null) return all.filter((media) => media.progress > 0 || media.status === "COMPLETED" || media.historyAt !== null);
    const byId: Record<number, MediaRecord> = {};
    for (const media of all) {
      const belongs = inWindow(media.historyAt, period)
        || inWindow(media.startedAt, period)
        || inWindow(media.completedAt, period);
      if (belongs) byId[media.mediaId] = media;
    }
    return Object.keys(byId).map((id) => byId[Number(id)]).sort((a, b) => a.mediaId - b.mediaId);
  }

  function completedMedia(all: MediaRecord[], period: ReturnType<typeof periodFor>): MediaRecord[] {
    if (period.start === null) return all.filter((media) => media.status === "COMPLETED");
    return all.filter((media) => media.status === "COMPLETED" && inWindow(media.completedAt, period));
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
          sourceRank: seed.rank
        });
        count++;
      }
    }
    return selected;
  }

  function buildSession(all: MediaRecord[], details: Record<number, StudioMetadata>, discovery: MediaRecord[], settings: WrappedSettings, nowValue?: number): WrappedSession {
    const period = periodFor(settings.period, nowValue);
    const watched = settings.includeWatched ? selectedMedia(all, period) : [];
    const completed = settings.includeCompleted ? completedMedia(all, period) : [];
    const ranked = rankMedia(watched, period);
    const genres = genreStats(watched);
    const studio = topStudio(watched, details);
    const relevantById: Record<number, MediaRecord> = {};
    for (const media of [...selectedMedia(all, period), ...completedMedia(all, period)]) relevantById[media.mediaId] = media;
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
      accuracyNote: "Bounded-period membership uses dated Seanime watch history plus AniList start and completion dates. AniList list-update timestamps are never treated as watch evidence.",
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

  return { fallbackArt, mediaFromBase, extractUserScore, scoreDiagnostics, normalizeCollection, periodFor, buildSession };
}

export type WrappedDomain = ReturnType<typeof createDomain>;
