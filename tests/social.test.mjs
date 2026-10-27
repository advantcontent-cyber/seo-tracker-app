// Regression tests for lib/social.js — run with `npm test`.
//
// 1. Guards the 2026-10-12 fix: the Social tab's "Views" headline must be the
//    account-level figure (Meta Business Suite's "Views › From organic" for
//    Facebook, Instagram's account `views`), NOT the sum of views of the posts
//    published in the range — that undercounted ICKY's 5–11 Oct week (5,431 vs
//    Meta's 9,464) because views of older posts/stories were never counted.
// 2. Date ranges, organic-only Facebook views, the 6-month baseline and the
//    Overall tab's metrics (Oct 2026 refinements).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSocialData, rangeWindows, UNASSIGNED_PILLAR } from "../lib/social.js";

const fbPost = (impressions, extra = {}) => ({
  post_message: "Post", post_created_time: "2026-10-06T10:00:00", permalink_url: `https://fb/${Math.random()}`,
  post_impressions: impressions, post_reactions_like_total: 1, ...extra,
});
const igPost = (views) => ({
  media_caption: "Post", timestamp: "2026-10-06T10:00:00", media_permalink: `https://ig/${Math.random()}`,
  media_views: views, media_like_count: 1,
});
const views = (platform) => platform.metrics.find((m) => m.key === "impressions");

const posts = {
  fbCurrent: [fbPost(3000), fbPost(2431)], fbPrevious: [fbPost(16000)],
  igCurrent: [igPost(3200)],               igPrevious: [igPost(4000)],
};

test("Facebook and Instagram Views use the account-level figures, not the post sum", () => {
  const d = buildSocialData({
    ...posts,
    fbPageViews:    { current: 9464,  previous: 12691 },
    igAccountViews: { current: 20383, previous: 18627 },
  });
  assert.equal(views(d.facebook).value, 9464);
  assert.equal(views(d.facebook).prev, 12691);
  assert.equal(views(d.instagram).value, 20383);
  assert.equal(views(d.overall).value, 9464 + 20383);
  assert.equal(views(d.overall).prev, 12691 + 18627);
});

test("Avg Views / Post stays a per-post average", () => {
  const d = buildSocialData({ ...posts, fbPageViews: { current: 9464, previous: 12691 } });
  const avg = d.facebook.account.find((s) => s.label === "Avg Views / Post");
  assert.equal(avg.value, "2,716"); // (3000 + 2431) / 2 posts
});

test("Falls back to the post sum per platform when an account-level pull failed", () => {
  const d = buildSocialData({ ...posts, fbPageViews: null, igAccountViews: { current: 20383, previous: 18627 } });
  assert.equal(views(d.facebook).value, 5431);
  assert.equal(views(d.instagram).value, 20383);
  assert.equal(views(d.overall).value, 5431 + 20383);
});

test("Facebook post Views are organic-only when the organic field is present", () => {
  const d = buildSocialData({ ...posts, fbCurrent: [fbPost(3000, { post_impressions_organic: 1000 })] });
  assert.equal(d.facebook.posts[0].views, 1000);
});

test("Overall drops Posts Published; Facebook and Instagram keep it", () => {
  const d = buildSocialData(posts);
  assert.equal(d.overall.metrics.some((m) => m.key === "posts"), false);
  assert.equal(d.facebook.metrics.some((m) => m.key === "posts"), true);
  assert.equal(d.instagram.metrics.some((m) => m.key === "posts"), true);
  assert.equal(d.overall.metrics.some((m) => m.key === "reach"), false);
});

test("rangeWindows: any range, previous is the equal-length range before it, baseline is 6 months", () => {
  const w = rangeWindows("2026-10-01", "2026-10-28");
  assert.equal(w.days, 28);
  assert.deepEqual(w.current, { from: "2026-10-01", to: "2026-10-28" });
  assert.deepEqual(w.previous, { from: "2026-09-03", to: "2026-09-30" });
  assert.deepEqual(w.baseline, { from: "2026-04-01", to: "2026-09-30" });
});

test("Normalized Performance compares with the 6-month baseline when it is available", () => {
  const base = { days: 183, fb: Array.from({ length: 10 }, () => fbPost(1000)), ig: [], fbViews: 5000, igViews: 0 };
  const d = buildSocialData({ ...posts, baseline: base, days: 7 });
  const avg = d.facebook.account.find((s) => s.label === "Avg Views / Post");
  assert.equal(avg.value, "2,716");
  assert.equal(Math.round(avg.delta), 172); // vs 1,000 per post
  const none = buildSocialData(posts).facebook.account[0];
  assert.equal(none.delta, null);
});

test("Pillars: saved override beats the sheet, the sheet beats Unassigned", () => {
  const link = "https://fb/x";
  const d = buildSocialData(
    { ...posts, fbCurrent: [fbPost(100, { permalink_url: link }), fbPost(50, { permalink_url: "https://fb/y" }), fbPost(10, { permalink_url: "https://fb/z" })] },
    { pillarOverrides: { [link]: "Manual" }, pillarLookup: (p) => (p.link === "https://fb/y" ? "Sheet" : null) },
  );
  const byLink = Object.fromEntries(d.facebook.posts.map((p) => [p.link, p.pillar]));
  assert.equal(byLink[link], "Manual");
  assert.equal(byLink["https://fb/y"], "Sheet");
  assert.equal(byLink["https://fb/z"], UNASSIGNED_PILLAR);
});
