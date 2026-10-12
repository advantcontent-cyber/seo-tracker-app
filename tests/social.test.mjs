// Regression tests for lib/social.js's buildSocialData — run with `npm test`.
//
// Guards the 2026-10-12 fix: the Social tab's "Views" headline must be the
// account-level figure (Meta Business Suite's "Views › From organic" for
// Facebook, Instagram's account `views`), NOT the sum of views of the posts
// published that week — that undercounted ICKY's 5–11 Oct week (5,431 vs
// Meta's 9,464) because views of older posts/stories were never counted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSocialData } from "../lib/social.js";

const fbPost = (impressions, reach = 100) => ({
  post_message: "Post", post_created_time: "2026-10-06T10:00:00", permalink_url: `https://fb/${Math.random()}`,
  post_impressions: impressions, post_impressions_unique: reach, post_reactions_like_total: 1,
});
const igPost = (views, reach = 100) => ({
  media_caption: "Post", timestamp: "2026-10-06T10:00:00", media_permalink: `https://ig/${Math.random()}`,
  media_views: views, media_reach: reach, media_like_count: 1,
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
