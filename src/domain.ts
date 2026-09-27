export type PeriodKey = "month" | "previous-month" | "last-3" | "last-6" | "ytd" | "full-year" | "all-time";

export interface WrappedSettings {
  period: PeriodKey;
  includeWatched: boolean;
  includeCompleted: boolean;
  includeRatings: boolean;
  recommendations: boolean;
  soundtrack: "Inferno" | "Bling-Bang-Bang-Born" | "Otonoke" | "Black Catcher" | "Random" | "Off";
  volume: number;
  autoAdvance: boolean;
}

export interface MediaRecord {
  mediaId: number;
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

  function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function userScoreFromPoint100(value: unknown): number | null {
    const score = numberOrNull(value);
    return score === null ? null : Math.max(0, Math.min(10, score / 10));
  }

  function timestamp(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
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

  function mediaFromBase(media: any, entry?: any, history?: any): MediaRecord {
    return {
      mediaId: Number(media?.id || history?.mediaId || 0),
      title: titleOf(media),
      cover: media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || fallbackArt,
      banner: media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || fallbackArt,
      color: media?.coverImage?.color || "#8b5cf6",
      genres: Array.isArray(media?.genres) ? media.genres.filter((genre: unknown) => typeof genre === "string") : [],
      globalScore: numberOrNull(media?.meanScore),
      // getRawAnimeCollection requests POINT_100 scores. Wrapped presents user
      // ratings on a 0-10 scale, while AniList meanScore remains POINT_100.
      userScore: userScoreFromPoint100(entry?.score),
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
        if (!existing || normalized.updatedAt! > (existing.updatedAt || 0)) byId[id] = normalized;
      }
    }
    return Object.keys(byId).map((id) => byId[Number(id)]).sort((a, b) => a.mediaId - b.mediaId);
  }

  function periodFor(key: PeriodKey, nowValue?: number) {
    const now = new Date(nowValue || Date.now());
    const end = now.getTime();
    const monthName = now.toLocaleString("en", { month: "long" });
    if (key === "all-time") return { key, label: "All Time", context: "across your anime journey", start: null, end };
    if (key === "month") return { key, label: `${monthName} ${now.getFullYear()}`, context: "this month", start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end };
    if (key === "previous-month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const stop = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
      return { key, label: `${start.toLocaleString("en", { month: "long" })} ${start.getFullYear()}`, context: "that month", start: start.getTime(), end: stop };
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
    return all.filter((media) => inWindow(media.historyAt, period) || (media.historyAt === null && media.progress > 0 && inWindow(media.updatedAt, period)));
  }

  function completedMedia(all: MediaRecord[], period: ReturnType<typeof periodFor>): MediaRecord[] {
    if (period.start === null) return all.filter((media) => media.status === "COMPLETED");
    return all.filter((media) => media.status === "COMPLETED" && inWindow(media.completedAt, period));
  }

  function engagement(media: MediaRecord, period: ReturnType<typeof periodFor>): number {
    const historyInPeriod = inWindow(media.historyAt, period) ? 1 : 0;
    const progress = Math.max(media.progress, media.historyEpisode || 0);
    return historyInPeriod * 1_000_000 + progress * 1_000 + (media.status === "COMPLETED" ? 100 : 0) + (media.userScore || 0) * 3;
  }

  function rankMedia(watched: MediaRecord[], period: ReturnType<typeof periodFor>): RankedMedia[] {
    return watched.slice().sort((a, b) => {
      const scoreDiff = engagement(b, period) - engagement(a, period);
      if (scoreDiff) return scoreDiff;
      const dateDiff = (b.historyAt || b.updatedAt || 0) - (a.historyAt || a.updatedAt || 0);
      return dateDiff || a.mediaId - b.mediaId;
    }).slice(0, 5).map((media, index) => ({
      ...media,
      rank: index + 1,
      engagementScore: engagement(media, period),
      metric: `${Math.max(media.progress, media.historyEpisode || 0)} episode${Math.max(media.progress, media.historyEpisode || 0) === 1 ? "" : "s"} progress`
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
      const label = new Date(media.historyAt!).toLocaleDateString("en", { weekday: "long" });
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
    for (const media of pool) if (media.mediaId && !unique[media.mediaId]) unique[media.mediaId] = media;
    return Object.keys(unique).map((id) => unique[Number(id)]);
  }

  function recommend(all: MediaRecord[], watched: MediaRecord[], details: Record<number, StudioMetadata>, discovery: MediaRecord[], genres: GenreStat[], studioName: string | null): Recommendation[] {
    const excluded = new Set(all.filter((media) => media.status === "COMPLETED" || media.status === "CURRENT" || media.status === "DROPPED").map((media) => media.mediaId));
    const planning = new Set(all.filter((media) => media.status === "PLANNING").map((media) => media.mediaId));
    const topGenres = genres.slice(0, 3).map((genre) => genre.name);
    return recommendationPool(all, watched, details, discovery).filter((media) => !excluded.has(media.mediaId)).map((media) => {
      const overlaps = media.genres.filter((genre) => topGenres.includes(genre));
      let score = (media.globalScore || 0) / 10 + overlaps.length * 18 + (planning.has(media.mediaId) ? 35 : 0);
      let reason = planning.has(media.mediaId) ? "From your planning list" : overlaps.length ? `Matches ${overlaps[0]}` : "Highly rated for your tastes";
      if (studioName && details[media.mediaId]?.studioNames?.includes(studioName)) { score += 12; reason = `From ${studioName}`; }
      return { ...media, reason, affinityScore: score };
    }).sort((a, b) => b.affinityScore - a.affinityScore || (b.globalScore || 0) - (a.globalScore || 0) || a.mediaId - b.mediaId).slice(0, 10);
  }

  function buildSession(all: MediaRecord[], details: Record<number, StudioMetadata>, discovery: MediaRecord[], settings: WrappedSettings, nowValue?: number): WrappedSession {
    const period = periodFor(settings.period, nowValue);
    const watched = settings.includeWatched ? selectedMedia(all, period) : [];
    const completed = settings.includeCompleted ? completedMedia(all, period) : [];
    const ranked = rankMedia(watched, period);
    const genres = genreStats(watched);
    const studio = topStudio(watched, details);
    const scored = settings.includeRatings ? watched.filter((media) => media.userScore !== null && media.userScore! > 0) : [];
    const averageScore = scored.length ? Math.round((scored.reduce((sum, media) => sum + media.userScore!, 0) / scored.length) * 10) / 10 : null;
    const highestRated = scored.slice().sort((a, b) => b.userScore! - a.userScore! || engagement(b, period) - engagement(a, period) || a.mediaId - b.mediaId)[0] || null;
    const recs = settings.recommendations ? recommend(all, watched, details, discovery, genres, studio?.name || null) : [];
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
      accuracyNote: "Period membership uses Seanime's latest saved watch-history timestamp when available, otherwise the AniList entry update timestamp. Current progress is not presented as period-specific episode history.",
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

  return { fallbackArt, mediaFromBase, normalizeCollection, periodFor, buildSession };
}

export type WrappedDomain = ReturnType<typeof createDomain>;
