#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "leetcode-stats.svg");
const USERNAME = "Pay4att";
const PROFILE_URL = `https://leetcode.cn/u/${USERNAME}/`;

const progressQuery = `
  query userProfileUserQuestionProgressV2($userSlug: String!) {
    userProfileUserQuestionProgressV2(userSlug: $userSlug) {
      numAcceptedQuestions { count difficulty }
      numFailedQuestions { count difficulty }
      numUntouchedQuestions { count difficulty }
      totalQuestionBeatsPercentage
    }
  }
`;

const calendarQuery = `
  query userProfileCalendar($userSlug: String!, $year: Int) {
    userCalendar(userSlug: $userSlug, year: $year) {
      streak
      totalActiveDays
      submissionCalendar
      recentStreak
    }
  }
`;

async function query(endpoint, graphql, variables) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      referer: PROFILE_URL,
      "user-agent": "Pay4att-GitHub-Profile/1.0",
    },
    body: JSON.stringify({ query: graphql, variables }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }

  return payload.data;
}

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function countsByDifficulty(rows = []) {
  return Object.fromEntries(rows.map(({ difficulty, count }) => [difficulty, count]));
}

function render(progress, calendar) {
  const solved = countsByDifficulty(progress.numAcceptedQuestions);
  const easy = solved.EASY ?? 0;
  const medium = solved.MEDIUM ?? 0;
  const hard = solved.HARD ?? 0;
  const total = easy + medium + hard;
  const submissions = Object.values(JSON.parse(calendar.submissionCalendar || "{}"))
    .reduce((sum, count) => sum + count, 0);
  const beats = progress.totalQuestionBeatsPercentage;
  const updated = new Date().toISOString().slice(0, 10);
  const barWidth = 480;
  const segment = (count) => total ? (count / total) * barWidth : 0;
  const easyWidth = segment(easy);
  const mediumWidth = segment(medium);
  const hardWidth = segment(hard);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="250" viewBox="0 0 1000 250" role="img" aria-labelledby="title desc">
  <title id="title">Pay4att's LeetCode China progress</title>
  <desc id="desc">${total} problems solved: ${easy} easy, ${medium} medium, and ${hard} hard.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117" />
      <stop offset="1" stop-color="#161b22" />
    </linearGradient>
    <style>
      text { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .eyebrow { fill: #ffa116; font-size: 12px; font-weight: 700; letter-spacing: 2px; }
      .total { fill: #f0f6fc; font-size: 58px; font-weight: 750; }
      .stat { fill: #f0f6fc; font-size: 22px; font-weight: 700; }
      .label { fill: #8b949e; font-size: 12px; }
      .difficulty { font-size: 13px; font-weight: 650; }
    </style>
  </defs>
  <rect x="1" y="1" width="998" height="248" rx="16" fill="url(#bg)" stroke="#30363d" />
  <text x="34" y="38" class="eyebrow">LEETCODE CN / PROGRESS</text>
  <text x="966" y="38" text-anchor="end" class="label">Updated ${escapeXml(updated)}</text>

  <text x="34" y="113" class="total">${total}</text>
  <text x="38" y="138" class="label">problems solved</text>
  <text x="38" y="185" class="stat">${Number.isFinite(beats) ? `${beats.toFixed(1)}%` : "—"}</text>
  <text x="38" y="206" class="label">users beaten</text>

  <text x="235" y="82" class="difficulty" fill="#3fb950">Easy</text>
  <text x="235" y="111" class="stat">${easy}</text>
  <text x="365" y="82" class="difficulty" fill="#d29922">Medium</text>
  <text x="365" y="111" class="stat">${medium}</text>
  <text x="515" y="82" class="difficulty" fill="#f85149">Hard</text>
  <text x="515" y="111" class="stat">${hard}</text>

  <rect x="235" y="136" width="${barWidth}" height="12" rx="6" fill="#21262d" />
  <rect x="235" y="136" width="${easyWidth.toFixed(2)}" height="12" rx="6" fill="#3fb950" />
  <rect x="${(235 + easyWidth).toFixed(2)}" y="136" width="${mediumWidth.toFixed(2)}" height="12" fill="#d29922" />
  <rect x="${(235 + easyWidth + mediumWidth).toFixed(2)}" y="136" width="${hardWidth.toFixed(2)}" height="12" rx="6" fill="#f85149" />

  <text x="235" y="187" class="stat">${calendar.totalActiveDays ?? 0}</text>
  <text x="235" y="208" class="label">active days</text>
  <text x="375" y="187" class="stat">${calendar.recentStreak ?? 0}</text>
  <text x="375" y="208" class="label">current streak</text>
  <text x="515" y="187" class="stat">${calendar.streak ?? 0}</text>
  <text x="515" y="208" class="label">best streak</text>
  <text x="655" y="187" class="stat">${submissions}</text>
  <text x="655" y="208" class="label">submissions / year</text>

  <path d="M790 72h142v112H790z" fill="#ffa116" opacity=".06" />
  <path d="M821 160l27-49 18 25 23-45 20 69" fill="none" stroke="#ffa116" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="889" cy="91" r="7" fill="#ffa116" />
</svg>
`;
}

const variables = { userSlug: USERNAME };
const [progressData, calendarData] = await Promise.all([
  query("https://leetcode.cn/graphql/", progressQuery, variables),
  query("https://leetcode.cn/graphql/noj-go/", calendarQuery, { ...variables, year: null }),
]);

const progress = progressData.userProfileUserQuestionProgressV2;
const calendar = calendarData.userCalendar;
if (!progress || !calendar) throw new Error(`LeetCode China user ${USERNAME} was not found`);

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(progress, calendar), "utf8");
console.log(`Updated ${path.relative(ROOT, OUTPUT)}`);
