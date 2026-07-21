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
                contributionLevel
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

function render(calendar) {
  const weeks = calendar.weeks ?? [];
  const days = weeks.flatMap((week) => week.contributionDays)
    .map(({ contributionCount: count, contributionLevel: level, date, weekday }) => ({ count, level, date, weekday }));
  const activeDays = days.filter(({ count }) => count > 0).length;
  const levelClass = {
    NONE: "level-0",
    FIRST_QUARTILE: "level-1",
    SECOND_QUARTILE: "level-2",
    THIRD_QUARTILE: "level-3",
    FOURTH_QUARTILE: "level-4",
  };
  const cell = 11;
  const gap = 3;
  const left = 78;
  const top = 58;
  const monthLabels = [];
  const cells = [];
  let previousMonth = -1;

  weeks.forEach((week, weekIndex) => {
    const x = left + weekIndex * (cell + gap);

    for (const { contributionCount: count, contributionLevel: level, date, weekday } of week.contributionDays) {
      const parsed = new Date(`${date}T00:00:00Z`);
      const month = parsed.getUTCMonth();
      const y = top + weekday * (cell + gap);

      cells.push(
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" class="${levelClass[level] ?? "level-0"}">` +
        `<title>${escapeXml(date)}: ${count} contribution${count === 1 ? "" : "s"}</title></rect>`,
      );

      if (weekday === 0 && month !== previousMonth) {
        previousMonth = month;
        monthLabels.push(
          `<text x="${x}" y="48" class="label">${parsed.toLocaleString("en", { month: "short", timeZone: "UTC" })}</text>`,
        );
      }
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180" viewBox="0 0 900 180" role="img" aria-labelledby="title desc">
  <title id="title">Pay4att's GitHub daily activity</title>
  <desc id="desc">${calendar.totalContributions} contributions across ${activeDays} active days in the last year.</desc>
  <defs>
    <style>
      text { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .title { fill: #1f2328; font-size: 14px; }
      .label { fill: #57606a; font-size: 11px; }
      .level-0 { fill: #ebedf0; }
      .level-1 { fill: #9be9a8; }
      .level-2 { fill: #40c463; }
      .level-3 { fill: #30a14e; }
      .level-4 { fill: #216e39; }
      @media (prefers-color-scheme: dark) {
        .title { fill: #e6edf3; }
        .label { fill: #8c959f; }
        .level-0 { fill: #161b22; }
        .level-1 { fill: #0e4429; }
        .level-2 { fill: #006d32; }
        .level-3 { fill: #26a641; }
        .level-4 { fill: #39d353; }
      }
    </style>
  </defs>
  <text x="78" y="22" class="title">${calendar.totalContributions.toLocaleString("en")} contributions in the last year</text>
  ${monthLabels.join("\n  ")}
  ${[[1, "Mon"], [3, "Wed"], [5, "Fri"]].map(([day, label]) => `<text x="38" y="${top + day * (cell + gap) + 9}" class="label">${label}</text>`).join("\n  ")}
  ${cells.join("\n  ")}
  <text x="715" y="169" class="label">Less</text>
  ${[0, 1, 2, 3, 4].map((level, index) => `<rect x="${746 + index * 14}" y="159" width="11" height="11" rx="2" class="level-${level}" />`).join("\n  ")}
  <text x="822" y="169" class="label">More</text>
</svg>
`;
}

const calendar = await readContributions();
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(calendar), "utf8");
console.log(`Updated ${path.relative(ROOT, OUTPUT)}`);
