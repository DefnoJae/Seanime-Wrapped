// Seanime Wrapped v1.0.0 — generated bundle
function createDomain() {
    const fallbackArt = "https://raw.githubusercontent.com/DefnoJae/Seanime-Wrapped/main/assets/fallback.svg";
    function numberOrNull(value) {
        return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    function userScoreFromPoint100(value) {
        const score = numberOrNull(value);
        return score === null ? null : Math.max(0, Math.min(10, score / 10));
    }
    function timestamp(value) {
        if (typeof value === "number" && Number.isFinite(value))
            return value > 1e12 ? value : value * 1000;
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
    function mediaFromBase(media, entry, history) {
        return {
            mediaId: Number(media?.id || history?.mediaId || 0),
            title: titleOf(media),
            cover: media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || fallbackArt,
            banner: media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || fallbackArt,
            color: media?.coverImage?.color || "#8b5cf6",
            genres: Array.isArray(media?.genres) ? media.genres.filter((genre) => typeof genre === "string") : [],
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
                if (!existing || normalized.updatedAt > (existing.updatedAt || 0))
                    byId[id] = normalized;
            }
        }
        return Object.keys(byId).map((id) => byId[Number(id)]).sort((a, b) => a.mediaId - b.mediaId);
    }
    function periodFor(key, nowValue) {
        const now = new Date(nowValue || Date.now());
        const end = now.getTime();
        const monthName = now.toLocaleString("en", { month: "long" });
        if (key === "all-time")
            return { key, label: "All Time", context: "across your anime journey", start: null, end };
        if (key === "month")
            return { key, label: `${monthName} ${now.getFullYear()}`, context: "this month", start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end };
        if (key === "previous-month") {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const stop = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
            return { key, label: `${start.toLocaleString("en", { month: "long" })} ${start.getFullYear()}`, context: "that month", start: start.getTime(), end: stop };
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
    function selectedMedia(all, period) {
        if (period.start === null)
            return all.filter((media) => media.progress > 0 || media.status === "COMPLETED" || media.historyAt !== null);
        return all.filter((media) => inWindow(media.historyAt, period) || (media.historyAt === null && media.progress > 0 && inWindow(media.updatedAt, period)));
    }
    function completedMedia(all, period) {
        if (period.start === null)
            return all.filter((media) => media.status === "COMPLETED");
        return all.filter((media) => media.status === "COMPLETED" && inWindow(media.completedAt, period));
    }
    function engagement(media, period) {
        const historyInPeriod = inWindow(media.historyAt, period) ? 1 : 0;
        const progress = Math.max(media.progress, media.historyEpisode || 0);
        return historyInPeriod * 1000000 + progress * 1000 + (media.status === "COMPLETED" ? 100 : 0) + (media.userScore || 0) * 3;
    }
    function rankMedia(watched, period) {
        return watched.slice().sort((a, b) => {
            const scoreDiff = engagement(b, period) - engagement(a, period);
            if (scoreDiff)
                return scoreDiff;
            const dateDiff = (b.historyAt || b.updatedAt || 0) - (a.historyAt || a.updatedAt || 0);
            return dateDiff || a.mediaId - b.mediaId;
        }).slice(0, 5).map((media, index) => ({
            ...media,
            rank: index + 1,
            engagementScore: engagement(media, period),
            metric: `${Math.max(media.progress, media.historyEpisode || 0)} episode${Math.max(media.progress, media.historyEpisode || 0) === 1 ? "" : "s"} progress`
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
            const label = new Date(media.historyAt).toLocaleDateString("en", { weekday: "long" });
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
        for (const media of pool)
            if (media.mediaId && !unique[media.mediaId])
                unique[media.mediaId] = media;
        return Object.keys(unique).map((id) => unique[Number(id)]);
    }
    function recommend(all, watched, details, discovery, genres, studioName) {
        const excluded = new Set(all.filter((media) => media.status === "COMPLETED" || media.status === "CURRENT" || media.status === "DROPPED").map((media) => media.mediaId));
        const planning = new Set(all.filter((media) => media.status === "PLANNING").map((media) => media.mediaId));
        const topGenres = genres.slice(0, 3).map((genre) => genre.name);
        return recommendationPool(all, watched, details, discovery).filter((media) => !excluded.has(media.mediaId)).map((media) => {
            const overlaps = media.genres.filter((genre) => topGenres.includes(genre));
            let score = (media.globalScore || 0) / 10 + overlaps.length * 18 + (planning.has(media.mediaId) ? 35 : 0);
            let reason = planning.has(media.mediaId) ? "From your planning list" : overlaps.length ? `Matches ${overlaps[0]}` : "Highly rated for your tastes";
            if (studioName && details[media.mediaId]?.studioNames?.includes(studioName)) {
                score += 12;
                reason = `From ${studioName}`;
            }
            return { ...media, reason, affinityScore: score };
        }).sort((a, b) => b.affinityScore - a.affinityScore || (b.globalScore || 0) - (a.globalScore || 0) || a.mediaId - b.mediaId).slice(0, 10);
    }
    function buildSession(all, details, discovery, settings, nowValue) {
        const period = periodFor(settings.period, nowValue);
        const watched = settings.includeWatched ? selectedMedia(all, period) : [];
        const completed = settings.includeCompleted ? completedMedia(all, period) : [];
        const ranked = rankMedia(watched, period);
        const genres = genreStats(watched);
        const studio = topStudio(watched, details);
        const scored = settings.includeRatings ? watched.filter((media) => media.userScore !== null && media.userScore > 0) : [];
        const averageScore = scored.length ? Math.round((scored.reduce((sum, media) => sum + media.userScore, 0) / scored.length) * 10) / 10 : null;
        const highestRated = scored.slice().sort((a, b) => b.userScore - a.userScore || engagement(b, period) - engagement(a, period) || a.mediaId - b.mediaId)[0] || null;
        const recs = settings.recommendations ? recommend(all, watched, details, discovery, genres, studio?.name || null) : [];
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
function createViewer() {
    function safeJson(value) {
        return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
    }
    function documentFor(input) {
        const payload = safeJson({
            ...input,
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
.topline{display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:12px;font-weight:760;letter-spacing:-.02em}.logo{display:flex;align-items:end;gap:3px;height:27px}.logo i{display:block;width:6px;border-radius:7px;background:linear-gradient(180deg,#ff99a8,#e84fe0 55%,#596dff)}.logo i:nth-child(1){height:12px}.logo i:nth-child(2){height:21px}.logo i:nth-child(3){height:27px}.logo i:nth-child(4){height:17px}.actions{display:flex;gap:9px}.icon-btn{width:42px;height:42px;border:1px solid rgba(255,255,255,.13);border-radius:50%;background:rgba(5,8,20,.52);backdrop-filter:blur(14px);display:grid;place-items:center;cursor:pointer;transition:transform .2s ease,background .2s}.icon-btn:hover{background:rgba(255,255,255,.13);transform:scale(1.05)}.icon-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}
.stage{position:absolute;inset:0;z-index:5}.slide{position:absolute;inset:0;padding:clamp(100px,14vh,145px) clamp(34px,8vw,140px) clamp(38px,7vh,75px);display:none;opacity:0;transform:scale(1.025);transition:opacity .55s ease,transform .7s var(--ease)}.slide.active{display:flex;opacity:1;transform:scale(1)}
.slide-inner{width:min(1420px,100%);height:100%;margin:auto;display:flex;align-items:center;position:relative}.eyebrow{font-size:clamp(12px,1vw,16px);text-transform:uppercase;letter-spacing:.16em;color:#d8d9ff;font-weight:750}.display{font-size:clamp(58px,8.4vw,138px);line-height:.85;letter-spacing:-.065em;margin:14px 0 24px;max-width:920px}.gradient{background:linear-gradient(110deg,#fff 8%,#efc8ff 35%,#ec52d7 70%,#7c8fff);-webkit-background-clip:text;background-clip:text;color:transparent}.subtitle{font-size:clamp(17px,1.6vw,27px);line-height:1.45;color:rgba(255,255,255,.78);max-width:620px}.reveal>*{opacity:0;transform:translateY(28px);filter:blur(8px)}.active .reveal>*{animation:reveal .72s var(--ease) forwards}.active .reveal>*:nth-child(2){animation-delay:.1s}.active .reveal>*:nth-child(3){animation-delay:.2s}.active .reveal>*:nth-child(4){animation-delay:.3s}@keyframes reveal{to{opacity:1;transform:none;filter:none}}
.count-layout{justify-content:space-between;gap:6vw}.count-copy{max-width:620px}.mega{font-size:clamp(100px,18vw,275px);line-height:.7;font-weight:900;letter-spacing:-.08em;text-shadow:0 0 50px rgba(235,70,215,.3)}.posters{position:relative;width:min(42vw,610px);height:min(64vh,620px)}.poster{position:absolute;left:50%;top:50%;width:clamp(130px,15vw,220px);aspect-ratio:2/3;object-fit:cover;border-radius:18px;border:1px solid rgba(255,255,255,.3);box-shadow:0 30px 80px rgba(0,0,0,.55);transform:translate(-50%,-50%) rotate(var(--r)) translateX(var(--x));transition:transform 1s var(--ease);animation:posterIn .9s var(--ease) both;animation-delay:var(--d)}@keyframes posterIn{from{opacity:0;transform:translate(-50%,-40%) rotate(0) scale(.65)}}
.genre-layout{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(400px,1.2fr);gap:9vw;align-items:center}.genre-name{font-size:clamp(64px,9vw,150px);font-weight:900;letter-spacing:-.06em;line-height:.86}.donut{width:min(24vw,310px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;margin-top:30px;background:conic-gradient(var(--pink) calc(var(--p)*1%),rgba(255,255,255,.13) 0);box-shadow:0 0 55px rgba(230,65,214,.25)}.donut:after{content:attr(data-label);width:67%;aspect-ratio:1;border-radius:50%;background:rgba(7,10,22,.9);display:grid;place-items:center;font-size:clamp(30px,4vw,60px);font-weight:850}.bars{display:grid;gap:18px}.bar-row{display:grid;grid-template-columns:130px 1fr 48px;gap:18px;align-items:center}.bar-track{height:12px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden}.bar-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--pink));transition:width 1.2s var(--ease) .25s}.active .bar-fill{width:var(--w)}
.rank-layout{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(420px,1.1fr);gap:7vw}.rank-poster{justify-self:end;width:min(31vw,440px);max-height:66vh;aspect-ratio:2/3;object-fit:cover;border-radius:26px;border:1px solid rgba(255,255,255,.25);box-shadow:0 40px 100px rgba(0,0,0,.6),0 0 70px color-mix(in srgb,var(--accent) 35%,transparent);animation:rankPoster 1s var(--ease) both}@keyframes rankPoster{from{opacity:0;transform:translateX(-60px) rotate(-5deg) scale(.88)}}.rank-number{font-size:clamp(82px,13vw,220px);font-weight:950;letter-spacing:-.08em;line-height:.72;color:var(--accent)}.rank-title{font-size:clamp(38px,5vw,78px);line-height:.96;letter-spacing:-.045em;margin:26px 0 18px}.winner .rank-poster{width:min(30vw,440px);box-shadow:0 40px 110px rgba(0,0,0,.65),0 0 120px rgba(241,79,217,.45)}.winner .rank-number{background:linear-gradient(100deg,#fff,#ff92e9,#7b8cff);-webkit-background-clip:text;color:transparent}
.overview{align-items:flex-end}.overview-grid{width:100%;display:grid;grid-template-columns:repeat(5,1fr);align-items:end;gap:14px}.overview-card{position:relative;min-width:0;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.18);background:var(--glass);box-shadow:0 20px 60px rgba(0,0,0,.35);animation:cardUp .7s var(--ease) both;animation-delay:var(--d)}.overview-card:first-child{transform:translateY(-28px);border-color:rgba(255,114,219,.7)}@keyframes cardUp{from{opacity:0;transform:translateY(60px)}}.overview-card img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover}.card-copy{padding:14px}.card-rank{position:absolute;top:12px;left:12px;font-size:30px;font-weight:900;text-shadow:0 3px 12px #000}.card-title{font-weight:750;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.meta{font-size:13px;color:rgba(255,255,255,.62);margin-top:5px}
.spotlight{display:grid;grid-template-columns:minmax(300px,1fr) minmax(310px,.9fr);gap:7vw}.spotlight-copy{align-self:center}.spotlight-title{font-size:clamp(46px,6.2vw,102px);line-height:.93;letter-spacing:-.055em;margin:15px 0}.hero-card{position:relative;justify-self:end;width:min(34vw,470px);height:min(66vh,650px);border-radius:28px;overflow:hidden;border:1px solid rgba(255,255,255,.22);box-shadow:0 40px 100px rgba(0,0,0,.58)}.hero-card img{width:100%;height:100%;object-fit:cover}.hero-card:after{content:"";position:absolute;inset:45% 0 0;background:linear-gradient(transparent,rgba(5,7,16,.96))}.hero-details{position:absolute;z-index:2;left:28px;right:28px;bottom:26px}.score{font-size:clamp(62px,8vw,120px);font-weight:930;letter-spacing:-.07em}.score small{font-size:.25em;color:rgba(255,255,255,.7);letter-spacing:0}
.studio-wall{position:absolute;right:0;width:55%;height:74%;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;opacity:.78;mask-image:linear-gradient(90deg,transparent,#000 25%)}.studio-wall img{width:100%;height:100%;min-height:0;object-fit:cover;border-radius:16px}.studio-name{position:relative;z-index:2;font-size:clamp(70px,11vw,180px);font-weight:930;letter-spacing:-.07em;line-height:.8;max-width:850px}.compact-posters{display:flex;gap:10px;margin-top:28px}.compact-posters img{width:80px;aspect-ratio:2/3;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.25)}
.recommend{align-items:flex-start;padding-top:2vh}.recommend-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:20px}.recommend-head h2{font-size:clamp(36px,4.2vw,66px);margin:0;letter-spacing:-.045em}.rec-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.rec-card{height:min(30vh,260px);position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:rgba(9,13,27,.7);animation:cardUp .6s var(--ease) both;animation-delay:calc(var(--i)*55ms)}.rec-card img{width:100%;height:100%;object-fit:cover}.rec-card:after{content:"";position:absolute;inset:25% 0 0;background:linear-gradient(transparent,rgba(5,8,18,.98))}.rec-copy{position:absolute;z-index:2;left:13px;right:13px;bottom:11px}.rec-rank{position:absolute;z-index:3;top:9px;left:10px;width:28px;height:28px;border-radius:8px;background:rgba(6,8,18,.78);display:grid;place-items:center;font-weight:850}.reason{display:inline-block;font-size:10px;padding:4px 7px;border-radius:99px;background:rgba(126,94,255,.7);margin-top:6px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.final{align-items:center;justify-content:center;text-align:center}.final h1{font-size:clamp(50px,7vw,110px);line-height:.9;letter-spacing:-.06em;margin:12px 0 35px}.summary{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:10px;width:min(850px,90vw);text-align:left}.summary div{padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:rgba(9,12,26,.45);backdrop-filter:blur(12px)}.thanks{margin-top:34px;font-size:clamp(18px,2vw,28px);color:#f0cbff}
.nav-hint{position:absolute;z-index:15;bottom:22px;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,.45);pointer-events:none}.loading{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:#080b17;transition:opacity .45s}.loading.hidden{opacity:0;pointer-events:none}.loader{text-align:center}.loader .logo{margin:0 auto 18px;transform:scale(1.5);justify-content:center}.loader p{color:rgba(255,255,255,.66)}.sound-prompt{position:absolute;z-index:25;right:clamp(22px,4vw,74px);bottom:26px;border:1px solid var(--line);border-radius:99px;background:rgba(7,10,22,.7);padding:10px 15px;display:none}.sound-prompt.show{display:block}
@media(max-width:900px){.slide{padding-left:28px;padding-right:28px}.genre-layout,.rank-layout,.spotlight{grid-template-columns:1fr}.posters,.hero-card,.rank-poster{display:none}.overview-grid{grid-template-columns:repeat(3,1fr)}.overview-card:nth-child(n+4){display:none}.rec-grid{grid-template-columns:repeat(2,1fr)}.rec-card{height:24vh}.recommend{overflow:auto}.studio-wall{width:75%;opacity:.38}.summary{grid-template-columns:1fr}.brand span{display:none}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.001ms!important;animation-delay:0ms!important;transition-duration:.001ms!important}.bg-layer{transform:scale(1.08)!important}}
</style></head><body>
<main id="app" aria-label="Seanime Wrapped presentation"><div class="background"><div id="bgA" class="bg-layer active"></div><div id="bgB" class="bg-layer"></div><div class="veil"></div><div class="grain"></div></div>
<header class="chrome"><div id="progress" class="progress" aria-label="Slide progress"></div><div class="topline"><div class="brand"><span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Seanime Wrapped</span></div><div class="actions"><button id="pause" class="icon-btn" aria-label="Pause auto-advance" title="Pause / resume">Ⅱ</button><button id="mute" class="icon-btn" aria-label="Mute soundtrack" title="Mute / unmute">♪</button><button id="close" class="icon-btn" aria-label="Close Wrapped" title="Close">×</button></div></div></header>
<section id="stage" class="stage" aria-live="polite"></section><div class="nav-hint">← → navigate · Space pauses · Esc closes</div><button id="soundPrompt" class="sound-prompt">Click to enable ${input.audioLabel ? "“" + input.audioLabel + "”" : "sound"}</button>
<div id="loading" class="loading"><div class="loader"><span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span><strong>Preparing your story</strong><p>Preparing the opening artwork.</p></div></div></main>
<script>
(()=>{"use strict";const INPUT=${payload};const S=INPUT.session;const esc=(v)=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const img=(v)=>esc(v||S.heroArt[0]);
const posters=(items)=>items.slice(0,5).map((m,i)=>'<img class="poster" style="--r:'+(-18+i*9)+'deg;--x:'+(-115+i*58)+'px;--d:'+(i*.08)+'s" data-src="'+img(m.cover)+'" alt="'+esc(m.title)+' poster">').join('');
const slides=[];const add=(kind,art,html,duration=6800)=>slides.push({kind,art:art||S.heroArt[0],html,duration});
add('intro',S.heroArt[0],'<div class="slide-inner"><div class="reveal"><div class="eyebrow">'+esc(S.period.label)+'</div><h1 class="display">Your <span class="gradient">'+esc(S.period.label.replace(/\\s+\\d{4}$/,''))+'</span><br>in Anime</h1><p class="subtitle">Let’s see what you’ve been watching '+esc(S.period.context)+'.</p></div></div>');
if(S.enabled.watched)add('watched',S.watched[0]?.banner,'<div class="slide-inner count-layout"><div class="count-copy reveal"><div class="eyebrow">You watched</div><div class="mega gradient" data-count="'+S.watched.length+'">0</div><h2>'+S.watched.length+' anime '+esc(S.period.context)+'</h2><p class="subtitle">Every title here is grounded in saved Seanime watch activity or a dated AniList entry update.</p></div><div class="posters">'+posters(S.watched)+'</div></div>');
if(S.genres.length){const g=S.genres[0];add('genres',S.watched.find(m=>m.genres.includes(g.name))?.banner,'<div class="slide-inner genre-layout"><div class="reveal"><div class="eyebrow">Your most watched genre was</div><div class="genre-name gradient">'+esc(g.name.toUpperCase())+'</div><div class="donut" style="--p:'+g.percentage+'" data-label="'+g.percentage+'%"></div></div><div class="bars">'+S.genres.map(x=>'<div class="bar-row"><b>'+esc(x.name)+'</b><div class="bar-track"><div class="bar-fill" style="--w:'+x.percentage+'%"></div></div><span>'+x.percentage+'%</span></div>').join('')+'</div></div>');}
S.topFive.slice().reverse().forEach((m)=>add('rank '+(m.rank===1?'winner':''),m.banner,'<div class="slide-inner rank-layout"><img class="rank-poster" style="--accent:'+esc(m.color)+'" data-src="'+img(m.cover)+'" alt="'+esc(m.title)+' poster"><div class="reveal" style="--accent:'+esc(m.color)+'"><div class="eyebrow">Your Top 5 Anime</div><div class="rank-number">#'+m.rank+'</div><h2 class="rank-title">'+esc(m.title)+'</h2><p class="subtitle">'+esc(m.metric)+'</p></div></div>',m.rank===1?8200:5600));
if(S.topFive.length)add('overview',S.topFive[0].banner,'<div class="slide-inner overview"><div style="width:100%"><div class="reveal"><div class="eyebrow">The full ranking</div><h2 style="font-size:clamp(40px,5vw,74px);margin:8px 0 28px">Your Top '+S.topFive.length+'</h2></div><div class="overview-grid">'+S.topFive.map((m,i)=>'<article class="overview-card" style="--d:'+(i*.1)+'s"><span class="card-rank">#'+m.rank+'</span><img data-src="'+img(m.cover)+'" alt=""><div class="card-copy"><div class="card-title">'+esc(m.title)+'</div><div class="meta">'+esc(m.metric)+'</div></div></article>').join('')+'</div></div></div>',7800);
if(S.enabled.ratings&&S.highestRated)add('rated',S.highestRated.banner,'<div class="slide-inner spotlight"><div class="spotlight-copy reveal"><div class="eyebrow">Your highest rated anime</div><h2 class="spotlight-title">'+esc(S.highestRated.title)+'</h2><div class="score gradient">'+INPUT.scoreLabels.highestRated+'<small> / 10</small></div><p class="subtitle">'+esc((S.highestRated.genres||[]).slice(0,3).join(' · '))+(S.highestRatedStudio?' · '+esc(S.highestRatedStudio):'')+' · '+esc(S.highestRated.progress)+' episodes progress</p></div><div class="hero-card"><img data-src="'+img(S.highestRated.cover)+'" alt="'+esc(S.highestRated.title)+' poster"><div class="hero-details"><b>Your score</b><div>'+INPUT.scoreLabels.highestRated+'/10</div></div></div></div>');
if(S.topStudio)add('studio',S.topStudio.anime[0]?.banner,'<div class="slide-inner"><div class="studio-wall">'+S.topStudio.anime.slice(0,8).map(m=>'<img data-src="'+img(m.cover)+'" alt="">').join('')+'</div><div class="reveal" style="position:relative;z-index:3"><div class="eyebrow">You spent the most progress with</div><div class="studio-name gradient">'+esc(S.topStudio.name)+'</div><p class="subtitle">Based on studio metadata available for your most engaged titles.</p><div class="compact-posters">'+S.topStudio.anime.slice(0,6).map(m=>'<img data-src="'+img(m.cover)+'" alt="'+esc(m.title)+'">').join('')+'</div></div></div>');
if(S.enabled.completed)add('completed',S.completed[0]?.banner,'<div class="slide-inner count-layout"><div class="count-copy reveal"><div class="eyebrow">You completed</div><div class="mega gradient" data-count="'+S.completed.length+'">0</div><h2>'+S.completed.length+' anime '+esc(S.period.context)+'</h2></div><div class="posters">'+posters(S.completed)+'</div></div>');
if(S.enabled.ratings)add('average',S.highestRated?.banner,'<div class="slide-inner final"><div class="reveal"><div class="eyebrow">Your average score</div><div class="display gradient">'+(INPUT.scoreLabels.average===null?'—':INPUT.scoreLabels.average)+'</div><p class="subtitle" style="margin:auto">'+(S.averageScore===null?'No anime in this period had a user score. That’s okay—your recap stays honest.':'Calculated only from scores you gave, never AniList community scores.')+'</p></div></div>');
if(S.activeDay)add('day',S.heroArt[1],'<div class="slide-inner"><div class="reveal"><div class="eyebrow">Your most active saved-watch weekday</div><h2 class="display gradient">'+esc(S.activeDay.label)+'</h2><p class="subtitle">'+S.activeDay.count+' title'+(S.activeDay.count===1?'':'s')+' had their latest saved watch record on this weekday.</p><p class="meta" style="max-width:620px;margin-top:25px">'+esc(S.activeDay.interpretation)+'</p></div></div>');
if(S.enabled.recommendations&&S.recommendations.length)add('recommend',S.recommendations[0].banner,'<div class="slide-inner recommend"><div style="width:100%"><div class="recommend-head"><div><div class="eyebrow">What comes next</div><h2>Most likely next watch</h2></div><span class="meta">Taste-fit shortlist</span></div><div class="rec-grid">'+S.recommendations.map((m,i)=>'<article class="rec-card" style="--i:'+i+'"><span class="rec-rank">'+(i+1)+'</span><img data-src="'+img(m.cover)+'" alt=""><div class="rec-copy"><b>'+esc(m.title)+'</b><div class="meta">'+(m.globalScore?('★ '+(m.globalScore/10).toFixed(1)+' · '):'')+esc((m.genres||[]).slice(0,2).join(', '))+'</div><span class="reason">'+esc(m.reason)+'</span></div></article>').join('')+'</div></div></div>',10000);
add('final',S.topFive[0]?.banner,'<div class="slide-inner final"><div class="reveal"><div class="eyebrow">'+esc(S.period.label)+' in a nutshell</div><h1>That was your<br><span class="gradient">Seanime Wrapped</span></h1><div class="summary">'+S.summary.map(x=>'<div>'+esc(x)+'</div>').join('')+'</div><div class="thanks">Thanks for watching.</div></div></div>',12000);
const FALLBACK="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 675'%3E%3Cdefs%3E%3ClinearGradient id='g'%3E%3Cstop stop-color='%234c5cff'/%3E%3Cstop offset='.55' stop-color='%23bd42d8'/%3E%3Cstop offset='1' stop-color='%23101525'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='675' fill='%23070a14'/%3E%3Ccircle cx='380' cy='270' r='330' fill='url(%23g)' opacity='.8'/%3E%3C/svg%3E";const MAX_PRELOAD_AHEAD=2;const failedArt=new Set(),artLoads=new Map();const app=document.getElementById('app'),stage=document.getElementById('stage'),progress=document.getElementById('progress'),loading=document.getElementById('loading'),mute=document.getElementById('mute'),pause=document.getElementById('pause'),prompt=document.getElementById('soundPrompt');let index=0,paused=!INPUT.settings.autoAdvance,elapsed=0,last=0,raf=0,closed=false,bgFlip=false,audio=null;let effectRafs=[];
stage.innerHTML=slides.map((s,i)=>'<article class="slide '+esc(s.kind)+'" data-index="'+i+'">'+s.html+'</article>').join('');progress.innerHTML=slides.map(()=>'<span class="segment"><i></i></span>').join('');
function requestEffect(fn){const id=requestAnimationFrame(t=>{effectRafs=effectRafs.filter(value=>value!==id);fn(t)});effectRafs.push(id);return id}function clearEffects(){effectRafs.forEach(cancelAnimationFrame);effectRafs=[]}function resolvedArt(url){return !url||failedArt.has(url)?FALLBACK:url}function setBackground(url){const incoming=document.getElementById(bgFlip?'bgA':'bgB'),outgoing=document.getElementById(bgFlip?'bgB':'bgA');const clean=String(resolvedArt(url)).split('"').join('').split(String.fromCharCode(92)).join('');incoming.style.backgroundImage='url("'+clean+'")';incoming.classList.add('active');outgoing.classList.remove('active');bgFlip=!bgFlip}
function loadArtwork(url){const source=String(url||'');if(!source||failedArt.has(source))return Promise.resolve(FALLBACK);if(artLoads.has(source))return artLoads.get(source);const pending=new Promise(resolve=>{const image=new Image();const finish=(result)=>{clearTimeout(timer);image.onload=null;image.onerror=null;resolve(result)};const timer=setTimeout(()=>{failedArt.add(source);image.src='';finish(FALLBACK)},6000);image.onload=()=>finish(source);image.onerror=()=>{failedArt.add(source);finish(FALLBACK)};image.src=source});artLoads.set(source,pending);return pending}
function prepareSlide(slideIndex){const record=slides[slideIndex],root=document.querySelector('.slide[data-index="'+slideIndex+'"]');if(!record||!root)return Promise.resolve();const images=[...root.querySelectorAll('img[data-src]')];return Promise.all([loadArtwork(record.art),...images.map(image=>loadArtwork(image.dataset.src))]).then(results=>{images.forEach((image,i)=>{image.src=results[i+1]||FALLBACK;image.removeAttribute('data-src');image.addEventListener('error',()=>{image.src=FALLBACK},{once:true})})})}
function primeWindow(center){const pending=[];for(let offset=0;offset<=MAX_PRELOAD_AHEAD;offset++){const slideIndex=center+offset;if(slideIndex<slides.length)pending.push(prepareSlide(slideIndex))}return Promise.all(pending)}
function countUp(root){clearEffects();root.querySelectorAll('[data-count]').forEach(el=>{const target=Number(el.dataset.count||0);if(matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=target;return}const start=performance.now();const step=t=>{if(closed)return;const p=Math.min(1,(t-start)/900);el.textContent=Math.round(target*(1-Math.pow(1-p,3)));if(p<1)requestEffect(step)};requestEffect(step)})}
function show(next){index=Math.max(0,Math.min(slides.length-1,next));elapsed=0;last=performance.now();primeWindow(index);document.querySelectorAll('.slide').forEach((el,i)=>el.classList.toggle('active',i===index));setBackground(slides[index].art);countUp(document.querySelector('.slide[data-index="'+index+'"]'));updateProgress(0)}
function updateProgress(frac){[...progress.children].forEach((seg,i)=>seg.firstElementChild.style.width=(i<index?100:i>index?0:frac*100)+'%')}
function tick(now){if(closed)return;if(!last)last=now;if(!paused){elapsed+=now-last;const duration=slides[index].duration;const fraction=Math.min(1,elapsed/duration);updateProgress(fraction);if(fraction>=1&&index<slides.length-1){show(index+1)}else if(fraction>=1){paused=true;pause.textContent='▶';pause.setAttribute('aria-label','Resume auto-advance')}}last=now;raf=requestAnimationFrame(tick)}
function togglePause(){paused=!paused;pause.textContent=paused?'▶':'Ⅱ';pause.setAttribute('aria-label',paused?'Resume auto-advance':'Pause auto-advance');last=performance.now()}
function setupAudio(){if(!INPUT.audioSource){mute.textContent='×';mute.setAttribute('aria-label','No soundtrack available');return}audio=new Audio(INPUT.audioSource);audio.loop=true;audio.volume=0;audio.muted=false;const wanted=Math.max(0,Math.min(1,Number(INPUT.settings.volume||30)/100));const play=()=>audio.play().then(()=>{prompt.classList.remove('show');const begin=performance.now();const fade=t=>{if(!audio||closed)return;audio.volume=Math.min(wanted,wanted*((t-begin)/900));if(audio.volume<wanted)requestEffect(fade)};requestEffect(fade)}).catch(()=>prompt.classList.add('show'));play();prompt.addEventListener('click',play)}
function toggleMute(){if(!audio)return;audio.muted=!audio.muted;mute.textContent=audio.muted?'♩':'♪';mute.setAttribute('aria-label',audio.muted?'Unmute soundtrack':'Mute soundtrack')}
function cleanup(){cancelAnimationFrame(raf);clearEffects();window.removeEventListener('keydown',onKey);stage.removeEventListener('click',onStage);prompt.replaceWith(prompt.cloneNode(true));if(audio){audio.volume=0;audio.pause();audio.removeAttribute('src');audio.load();audio=null}}
function close(){if(closed)return;closed=true;app.classList.add('closing');cleanup();window.webview?.send('close',{})}
function onKey(e){if(e.key==='ArrowRight')show(index+1);else if(e.key==='ArrowLeft')show(index-1);else if(e.key==='Escape')close();else if(e.code==='Space'){e.preventDefault();togglePause()}}
function onStage(e){if(e.target.closest('button'))return;show(index+(e.clientX<innerWidth/2?-1:1))}
document.getElementById('close').addEventListener('click',close);mute.addEventListener('click',toggleMute);pause.addEventListener('click',togglePause);window.addEventListener('keydown',onKey);stage.addEventListener('click',onStage);window.addEventListener('pagehide',cleanup,{once:true});
primeWindow(0).then(()=>{loading.classList.add('hidden');show(0);setupAudio();raf=requestAnimationFrame(tick)});
})();
</script></body></html>`;
    }
    return { documentFor };
}
// Generated by scripts/generate-audio.mjs. Do not edit.
function createAudioRegistry() {
    return {};
}
const SHARED_DOMAIN = "seanime-wrapped/domain/v1";
const SHARED_VIEWER = "seanime-wrapped/viewer/v1";
const SHARED_AUDIO = "seanime-wrapped/audio/v1";
function init() {
    $shared.define(SHARED_DOMAIN, createDomain);
    $shared.define(SHARED_VIEWER, createViewer);
    $shared.define(SHARED_AUDIO, createAudioRegistry);
    $ui.register((ctx) => {
        const domain = $shared.use("seanime-wrapped/domain/v1");
        const viewerBuilder = $shared.use("seanime-wrapped/viewer/v1");
        const audioRegistry = $shared.use("seanime-wrapped/audio/v1");
        const SETTINGS_KEY = "settings-v1";
        const DETAIL_CACHE_KEY = "metadata-cache-v1";
        const LAST_SESSION_KEY = "last-session-v1";
        const LAST_GENERATED_KEY = "last-generated-v1";
        const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='1' x2='1' y2='0'%3E%3Cstop stop-color='%235b6cff'/%3E%3Cstop offset='.55' stop-color='%23d946ef'/%3E%3Cstop offset='1' stop-color='%23ff7b8b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='128' height='128' rx='30' fill='%230b1020'/%3E%3Cpath d='M24 91V68a8 8 0 0 1 16 0v23zm22 0V45a8 8 0 0 1 16 0v46zm22 0V28a8 8 0 0 1 16 0v63zm22 0V54a8 8 0 0 1 16 0v37z' fill='url(%23g)'/%3E%3C/svg%3E";
        const defaults = {
            period: "month",
            includeWatched: true,
            includeCompleted: true,
            includeRatings: true,
            recommendations: true,
            soundtrack: "Random",
            volume: 30,
            autoAdvance: true
        };
        function loadSettings() {
            try {
                const stored = $storage.get(SETTINGS_KEY) || {};
                return { ...defaults, ...stored, volume: Math.max(0, Math.min(100, Number(stored.volume ?? defaults.volume))) };
            }
            catch {
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
        const lastGenerated = ctx.state($storage.get(LAST_GENERATED_KEY) || "");
        const periodRef = ctx.fieldRef(settings.period);
        const watchedRef = ctx.fieldRef(settings.includeWatched);
        const completedRef = ctx.fieldRef(settings.includeCompleted);
        const ratingsRef = ctx.fieldRef(settings.includeRatings);
        const recommendationsRef = ctx.fieldRef(settings.recommendations);
        const soundtrackRef = ctx.fieldRef(settings.soundtrack);
        const volumeRef = ctx.fieldRef(String(settings.volume));
        const autoAdvanceRef = ctx.fieldRef(settings.autoAdvance);
        function saveSettings() {
            settings = {
                period: periodRef.current,
                includeWatched: Boolean(watchedRef.current),
                includeCompleted: Boolean(completedRef.current),
                includeRatings: Boolean(ratingsRef.current),
                recommendations: Boolean(recommendationsRef.current),
                soundtrack: soundtrackRef.current,
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
        function chooseSoundtrack() {
            if (settings.soundtrack === "Off")
                return { source: "", label: "" };
            const available = Object.keys(audioRegistry).filter((label) => Boolean(audioRegistry[label]));
            if (!available.length)
                return { source: "", label: "" };
            let label = settings.soundtrack;
            if (label === "Random")
                label = available[Math.floor(Math.random() * available.length)];
            if (!audioRegistry[label]) {
                const fallback = available[0];
                ctx.toast.warning(`${label} is not installed locally; using ${fallback} instead.`);
                label = fallback;
            }
            return { source: audioRegistry[label] || "", label };
        }
        function startWrapped() {
            if (loading.get())
                return;
            saveSettings();
            loading.set(true);
            error.set("");
            tray.update();
            try {
                const collection = $anilist.getRawAnimeCollection(forceRefresh);
                const history = ctx.continuity.getWatchHistory();
                const all = domain.normalizeCollection(collection, history);
                if (!all.length)
                    throw new Error("No anime collection data is available. Connect AniList or add anime to your local account first.");
                const preliminary = domain.buildSession(all, {}, [], settings);
                const metadata = collectMetadata(preliminary);
                collectRelationMetadata(metadata, preliminary);
                const session = domain.buildSession(all, metadata, [], settings);
                if (!session.watched.length && settings.includeWatched) {
                    ctx.toast.warning("No defensible watch activity was found for this period. Wrapped will show the sections that are available.");
                }
                const soundtrack = chooseSoundtrack();
                if (settings.soundtrack !== "Off" && !soundtrack.source)
                    ctx.toast.info("No local soundtrack files were found, so this Wrapped will play silently.");
                viewerHtml = viewerBuilder.documentFor({ session, settings, audioSource: soundtrack.source, audioLabel: soundtrack.label });
                $storage.set(LAST_SESSION_KEY, session);
                $storage.set(LAST_GENERATED_KEY, session.generatedAt);
                lastGenerated.set(session.generatedAt);
                forceRefresh = false;
                refreshQueued.set(false);
                viewer.update();
                viewer.show();
                viewerOpen = true;
                tray.close();
            }
            catch (cause) {
                const message = cause instanceof Error ? cause.message : String(cause || "Unknown error");
                error.set(message.includes("rate") ? "AniList is rate-limited right now. Cached data was insufficient; please try again later." : message);
                ctx.toast.error(error.get());
            }
            finally {
                loading.set(false);
                tray.update();
            }
        }
        const startHandler = ctx.eventHandler("seanime-wrapped-start", startWrapped);
        const refreshHandler = ctx.eventHandler("seanime-wrapped-refresh", () => {
            try {
                $storage.remove(DETAIL_CACHE_KEY);
                $storage.remove(LAST_SESSION_KEY);
            }
            catch { }
            forceRefresh = true;
            refreshQueued.set(true);
            error.set("");
            ctx.toast.info("Refresh queued. Fresh collection data will be requested when you press Start Wrapped.");
            tray.update();
        });
        const volumeHandlers = {};
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
            const availableTracks = Object.keys(audioRegistry);
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
                    tray.select("Track", { fieldRef: soundtrackRef, options: ["Random", "Inferno", "Bling-Bang-Bang-Born", "Otonoke", "Black Catcher", "Off"].map((value) => ({ label: value, value })) }),
                    tray.text(`Local tracks available: ${availableTracks.length}/4`, { className: "sw-note" }),
                    tray.text(`Volume · ${currentVolume}%`, { className: "sw-label" }),
                    tray.flex([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => tray.div([
                        tray.button(String(value), { onClick: volumeHandlers[value], size: "xs" })
                    ], { className: value <= currentVolume ? "is-on" : "" })), { className: "sw-volume", gap: 1 })
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
                tray.text(lastGenerated.get() ? `Last generated ${new Date(lastGenerated.get()).toLocaleString()}` : "No Wrapped generated yet", { className: "sw-note" }),
                tray.text("Opening this tray never loads AniList data. Start Wrapped prepares one offline presentation session.", { className: "sw-note" })
            ], { className: "sw-shell", gap: 2 });
        });
        tray.onOpen(() => { tray.update(); });
        tray.onClose(() => { });
    });
}
