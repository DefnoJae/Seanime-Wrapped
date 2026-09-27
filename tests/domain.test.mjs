import test from "node:test";
import assert from "node:assert/strict";
import { createDomain } from "../src/domain.ts";
import { createViewer } from "../src/viewer.ts";

const domain = createDomain();
const now = new Date(2026, 8, 27, 12).getTime();

function media(id, overrides = {}) {
  return {
    mediaId: id,
    title: `Anime ${id}`,
    cover: `https://img.test/${id}.jpg`,
    banner: `https://img.test/${id}-banner.jpg`,
    color: "#8b5cf6",
    genres: [id % 2 ? "Action" : "Drama"],
    globalScore: 80 + (id % 10),
    userScore: null,
    status: "PLANNING",
    progress: 0,
    episodes: 12,
    duration: 24,
    updatedAt: null,
    startedAt: null,
    completedAt: null,
    historyAt: null,
    historyEpisode: null,
    ...overrides
  };
}

const settings = {
  period: "month",
  includeWatched: true,
  includeCompleted: true,
  includeRatings: true,
  recommendations: true,
  soundtrack: "Off",
  volume: 30,
  autoAdvance: true
};

test("period filtering uses dated watch history and never treats current progress as period history", () => {
  const september = new Date(2026, 8, 15, 18).getTime();
  const august = new Date(2026, 7, 20, 18).getTime();
  const all = [
    media(1, { status: "CURRENT", progress: 8, historyAt: september, historyEpisode: 8 }),
    media(2, { status: "CURRENT", progress: 10, historyAt: august, historyEpisode: 10 }),
    media(3, { status: "CURRENT", progress: 4, updatedAt: september })
  ];
  const session = domain.buildSession(all, {}, [], settings, now);
  assert.deepEqual(session.watched.map((item) => item.mediaId), [1, 3]);
  assert.match(session.accuracyNote, /Current progress is not presented as period-specific/);
});

test("period labels and weekday names are deterministic and contain no locale timestamps", () => {
  const month = domain.periodFor("month", now);
  const previous = domain.periodFor("previous-month", now);
  assert.equal(month.label, "September 2026");
  assert.equal(previous.label, "August 2026");
  assert.doesNotMatch(month.label + previous.label, /[\/:]|\d{1,2}:\d{2}/);

  const sunday = new Date(2026, 8, 27, 12).getTime();
  const session = domain.buildSession([media(1, { status: "CURRENT", progress: 1, historyAt: sunday })], {}, [], settings, now);
  assert.equal(session.activeDay?.label, "Sunday");
});

test("Top 5 ranking is deterministic and strongest engagement is rank one", () => {
  const historyAt = new Date(2026, 8, 20, 12).getTime();
  const all = Array.from({ length: 7 }, (_, index) => media(index + 1, {
    status: "CURRENT",
    progress: index + 1,
    historyEpisode: index + 1,
    historyAt
  }));
  const session = domain.buildSession(all, {}, [], settings, now);
  assert.deepEqual(session.topFive.map((item) => item.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(session.topFive.map((item) => item.mediaId), [7, 6, 5, 4, 3]);
});

test("ratings use only the user's score and completion uses completion dates", () => {
  const september = new Date(2026, 8, 12, 12).getTime();
  const all = [
    media(1, { status: "COMPLETED", progress: 12, historyAt: september, completedAt: september, userScore: 9, globalScore: 40 }),
    media(2, { status: "CURRENT", progress: 3, historyAt: september, userScore: 7, globalScore: 99 }),
    media(3, { status: "COMPLETED", progress: 12, historyAt: september, completedAt: new Date(2026, 7, 1).getTime(), userScore: null })
  ];
  const session = domain.buildSession(all, {}, [], settings, now);
  assert.equal(session.averageScore, 8);
  assert.equal(session.highestRated?.mediaId, 1);
  assert.deepEqual(session.completed.map((item) => item.mediaId), [1]);
});

test("completed-in-period titles count as watched and their ratings drive the score slides", () => {
  const september = [5, 12, 19].map((day) => new Date(2026, 8, day, 12).getTime());
  const all = [9, 8, 7].map((score, index) => media(index + 1, {
    status: "COMPLETED",
    progress: 12,
    completedAt: september[index],
    userScore: score,
    historyAt: null,
    updatedAt: null
  }));
  const session = domain.buildSession(all, {}, [], settings, now);
  assert.equal(session.watched.length, 3);
  assert.equal(session.completed.length, 3);
  assert.equal(session.averageScore, 8);
  assert.equal(session.highestRated?.userScore, 9);
});

test("POINT_100 collection scores normalize to 0-10 while global meanScore stays POINT_100", () => {
  const september = new Date(2026, 8, 12, 12).getTime();
  const collection = {
    MediaListCollection: {
      lists: [{ entries: [
        {
          score: 90, status: "CURRENT", progress: 8, updatedAt: september / 1000,
          media: { id: 1, title: { userPreferred: "Ninety" }, meanScore: 94, episodes: 12, genres: ["Action"], coverImage: { large: "https://img.test/1.jpg" }, bannerImage: "https://img.test/1-banner.jpg" }
        },
        {
          score: 70, status: "CURRENT", progress: 4, updatedAt: september / 1000,
          media: { id: 2, title: { userPreferred: "Seventy" }, meanScore: 71, episodes: 12, genres: ["Drama"], coverImage: { large: "https://img.test/2.jpg" }, bannerImage: "https://img.test/2-banner.jpg" }
        }
      ] }]
    }
  };
  const normalized = domain.normalizeCollection(collection, {
    1: { timeUpdated: september, episodeNumber: 8 },
    2: { timeUpdated: september, episodeNumber: 4 }
  });
  assert.deepEqual(normalized.map((item) => item.userScore), [9, 7]);
  assert.deepEqual(normalized.map((item) => item.globalScore), [94, 71]);

  const session = domain.buildSession(normalized, {}, [], settings, now);
  assert.equal(session.highestRated?.userScore, 9);
  assert.equal(session.averageScore, 8);
  const html = createViewer().documentFor({ session, settings, audioSource: "", audioLabel: "" });
  assert.match(html, /"userScore":9/);
  assert.match(html, /"averageScore":8/);
  assert.match(html, /"scoreLabels":\{"highestRated":"9\.0","average":"8\.0"\}/);
  assert.match(html, /INPUT\.scoreLabels\.highestRated\+'<small> \/ 10/);
  assert.match(html, /INPUT\.scoreLabels\.average===null\?'—':INPUT\.scoreLabels\.average/);
});

test("all-time sessions keep the hero artwork seed bounded for large libraries", () => {
  const allTimeSettings = { ...settings, period: "all-time", recommendations: false };
  const library = Array.from({ length: 500 }, (_, index) => media(index + 1, {
    status: "CURRENT",
    progress: index + 1,
    userScore: 8
  }));
  const session = domain.buildSession(library, {}, [], allTimeSettings, now);
  assert.ok(session.heroArt.length <= 8);
  assert.ok(session.heroArt.length < library.length);
});

test("recommendations render ten unique candidates and exclude active/completed/dropped anime", () => {
  const september = new Date(2026, 8, 12, 12).getTime();
  const watched = media(1, { status: "CURRENT", progress: 8, historyAt: september, genres: ["Action"] });
  const planning = Array.from({ length: 13 }, (_, index) => media(index + 10, { genres: ["Action"], status: "PLANNING" }));
  const excluded = media(99, { status: "DROPPED", genres: ["Action"] });
  const session = domain.buildSession([watched, ...planning, excluded], {}, [], settings, now);
  assert.equal(session.recommendations.length, 10);
  assert.equal(new Set(session.recommendations.map((item) => item.mediaId)).size, 10);
  assert.ok(session.recommendations.every((item) => item.status === "PLANNING"));
});

test("active weekday is omitted without genuine watch timestamps", () => {
  const september = new Date(2026, 8, 12, 12).getTime();
  const session = domain.buildSession([media(1, { status: "CURRENT", progress: 3, updatedAt: september })], {}, [], settings, now);
  assert.equal(session.activeDay, null);
});
