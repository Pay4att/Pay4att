#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "github-activity.svg");
const USERNAME = "Pay4att";

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("Set GITHUB_TOKEN or authenticate with the GitHub CLI");
  }
}

async function readContributions() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              firstDay
              contributionDays {
                contributionCount
                date
                weekday
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${githubToken()}`,
      "content-type": "application/json",
      "user-agent": "Pay4att-GitHub-Profile/1.0",
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  if (!response.ok) throw new Error(`GitHub request failed with HTTP ${response.status}`);

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }

  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error(`GitHub user ${USERNAME} was not found`);
  return calendar;
}

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function streaks(days) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const active = new Set(days.filter(({ count }) => count > 0).map(({ date }) => date));
  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let previous;

  for (const date of sorted) {
    const current = Date.parse(`${date}T00:00:00Z`);
    run = previous !== undefined && current - previous === 86_400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = current;
  }

  let cursor = active.has(today) ? today : active.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && active.has(cursor)) {
    current += 1;
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  }

  return { current, longest };
}

function render(calendar) {
  const weeks = calendar.weeks ?? [];
  const days = weeks.flatMap((week) => week.contributionDays)
    .map(({ contributionCount: count, date, weekday }) => ({ count, date, weekday }));
  const positive = days.filter(({ count }) => count > 0).map(({ count }) => count).sort((a, b) => a - b);
  const quantile = (ratio) => positive[Math.floor((positive.length - 1) * ratio)] ?? 0;
  const thresholds = [quantile(0.2), quantile(0.4), quantile(0.6), quantile(0.8)];
  const colors = ["#1b2433", "#12324a", "#0f4c5c", "#0b7285", "#14b8a6", "#5eead4"];
  const levelFor = (count) => count ? 1 + thresholds.filter((threshold) => count > threshold).length : 0;
  const { current, longest } = streaks(days);
  const activeDays = positive.length;
  const updated = new Date().toISOString().slice(0, 10);
  const cell = 12;
  const gap = 4;
  const left = 88;
  const top = 112;
  const monthLabels = [];
  const cells = [];
  let previousMonth = -1;

  weeks.forEach((week, weekIndex) => {
    const x = left + weekIndex * (cell + gap);

    for (const { contributionCount: count, date, weekday } of week.contributionDays) {
      const parsed = new Date(`${date}T00:00:00Z`);
      const month = parsed.getUTCMonth();
      const y = top + weekday * (cell + gap);

      cells.push(
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colors[levelFor(count)]}">` +
        `<title>${escapeXml(date)}: ${count} contribution${count === 1 ? "" : "s"}</title></rect>`,
      );

      if (weekday === 0 && month !== previousMonth) {
        previousMonth = month;
        monthLabels.push(
          `<text x="${x}" y="98" class="month">${parsed.toLocaleString("en", { month: "short", timeZone: "UTC" })}</text>`,
        );
      }
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="270" viewBox="0 0 1000 270" role="img" aria-labelledby="title desc">
  <title id="title">Pay4att's GitHub daily activity</title>
  <desc id="desc">${calendar.totalContributions} contributions across ${activeDays} active days in the last year.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220" />
      <stop offset="1" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#38bdf8" />
      <stop offset="1" stop-color="#5eead4" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18" />
    </filter>
    <style>
      text { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .eyebrow { fill: #5eead4; font-size: 12px; font-weight: 700; letter-spacing: 2px; }
      .stat { fill: #f8fafc; font-size: 21px; font-weight: 700; }
      .label, .month, .day { fill: #94a3b8; font-size: 11px; }
      .month { font-weight: 600; }
    </style>
  </defs>
  <rect x="1" y="1" width="998" height="268" rx="20" fill="url(#bg)" stroke="#243044" />
  <circle cx="920" cy="-5" r="115" fill="#14b8a6" opacity=".12" filter="url(#glow)" />
  <text x="32" y="38" class="eyebrow">GITHUB / DAILY ACTIVITY</text>
  <text x="32" y="70" class="stat">${calendar.totalContributions.toLocaleString("en")} <tspan class="label">contributions / year</tspan></text>
  <text x="330" y="70" class="stat">${current} <tspan class="label">day streak</tspan></text>
  <text x="530" y="70" class="stat">${activeDays} <tspan class="label">active days / year</tspan></text>
  <text x="968" y="38" text-anchor="end" class="label">Updated ${updated}</text>
  ${monthLabels.join("\n  ")}
  ${[[1, "Mon"], [3, "Wed"], [5, "Fri"]].map(([day, label]) => `<text x="32" y="${top + day * (cell + gap) + 10}" class="day">${label}</text>`).join("\n  ")}
  ${cells.join("\n  ")}
  <text x="32" y="247" class="label">Less</text>
  ${colors.map((color, index) => `<rect x="${67 + index * 19}" y="237" width="12" height="12" rx="3" fill="${color}" />`).join("\n  ")}
  <text x="187" y="247" class="label">More</text>
  <text x="760" y="247" class="label">Longest streak: ${longest} days</text>
  <rect x="880" y="237" width="88" height="2" rx="1" fill="url(#accent)" opacity=".75" />
</svg>
`;
}

const calendar = await readContributions();
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(calendar), "utf8");
console.log(`Updated ${path.relative(ROOT, OUTPUT)}`);
