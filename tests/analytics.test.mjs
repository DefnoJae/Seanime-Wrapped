import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomain } from '../src/domain.ts';
import { createViewer } from '../src/viewer.ts';
const domain = createDomain();
const now = new Date(2026, 9, 19, 12).getTime();
const at = (day) => new Date(2026, 9, day, 12).getTime();
const period = domain.periodFor('month', now);
const anime = (id, duration = 24) => domain.mediaFromBase({id, title:{userPreferred:`Anime ${id}`},duration,episodes:24,coverImage:{large:`https://example.com/${id}.png`}}, {progress:24,status:'CURRENT'});
const activity = (mediaId, day, progress, status='watched episode') => ({mediaId,createdAt:at(day),progress,status});

test('analytics counts explicit episode ranges, deduplicates overlaps, and unions weekly anime', () => {
  const all = [anime(1),anime(2, null)];
  all[0].historyAt=at(13); // same title on the same day must not double count
  const data=domain.watchAnalytics(all,period,{listActivities:[activity(1,12,'1 - 3'),activity(1,12,'3'),activity(1,13,'4'),activity(2,13,'1 - 2')]});
  assert.equal(data.anime,2);
  assert.equal(data.episodes,6);
  assert.equal(data.timedEpisodes,4);
  assert.equal(data.minutes,96);
  assert.equal(data.daily.find(d=>new Date(d.start).getDate()===12).episodes,3);
  const week=data.weekly.find(d=>d.episodes===6);
  assert.equal(week.anime,2);
  assert.equal(week.titles.length,2);
  assert.equal(data.background,all[0].banner);
});

test('latest history and completion never turn cumulative progress into dated episode totals', () => {
  const media=anime(1); media.historyAt=at(15);media.historyEpisode=24;
  const data=domain.watchAnalytics([media],period,{listActivities:[activity(1,14,null,'completed'),activity(1,16,'1 - 24','plans to watch'),activity(1,17,'9999999')]});
  assert.equal(data.anime,1);
  assert.equal(data.episodes,0);
  assert.equal(data.minutes,0);
  assert.equal(data.daily.find(d=>new Date(d.start).getDate()===16).anime,0);
});

test('analytics respects boundaries, empty periods, unknown IDs, and all-time availability', () => {
  const data=domain.watchAnalytics([anime(1)],period,{listActivities:[activity(1,1,'1'),activity(1,20,'2'),activity(99,2,'1'),{...activity(1,1,'3'),createdAt:period.start-1}]});
  assert.equal(data.episodes,1);
  assert.equal(data.daily.length,19);
  assert.ok(data.daily.every(d=>d.start<=now));
  const empty=domain.watchAnalytics([],period);
  assert.equal(empty.anime,0);assert.equal(empty.daily.length,19);
  const allTime=domain.watchAnalytics([anime(1)],domain.periodFor('all-time',now),{listActivities:[activity(1,10,'1')]});
  assert.equal(new Date(allTime.daily[0].start).getDate(),10);
});

test('analytics uses calendar days and Monday weeks across month boundaries', () => {
  const p=domain.periodFor('last-3',now);
  const activities=[{...activity(1,1,'1'),createdAt:new Date(2026,8,30,23,59).getTime()},activity(1,1,'2')];
  const data=domain.watchAnalytics([anime(1)],p,{listActivities:activities});
  assert.equal(data.weekly.find(d=>d.episodes===2).anime,1);
  assert.equal(data.daily.filter(d=>d.episodes>0).length,2);
});

test('analytics is placed immediately before recommendations and reuses viewer background', () => {
  const settings={period:'month',includeWatched:true,includeCompleted:true,includeRatings:true,recommendations:true,autoAdvance:false};
  const session=domain.buildSession([anime(1)],{},[],settings,now,{listActivities:[activity(1,12,'1')]});
  const html=createViewer().documentFor({session,settings});
  assert.ok(html.indexOf("add('analytics'")<html.indexOf("add('recommend'"));
  assert.match(html,/add\('analytics',\[S.analytics.background\]/);
  assert.match(html,/data-interval="weekly"/);
  assert.match(html,/role="tooltip"/);
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(()=>new Function(script[1]));
  assert.equal(domain.buildSession([],{},[],{...settings,includeWatched:false},now).analytics,undefined);
});
