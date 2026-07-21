#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "codex-usage.svg");
const DAYS = 371;

function readUsage() {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--stdio"], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "inherit"],
    });

    let buffer = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out while reading Codex usage"));
    }, 30_000);

    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if (message.id === 1 && message.result) {
          send({ method: "initialized" });
          send({ id: 2, method: "account/usage/read", params: null });
        }

        if (message.id === 2) {
          clearTimeout(timeout);
          child.stdin.end();
          child.kill();

          if (message.error) {
            reject(new Error(message.error.message ?? "Codex usage request failed"));
          } else {
            resolve(message.result);
          }
        }
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      if (code && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Codex app-server exited with code ${code}`));
      }
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "github-profile-usage", version: "1.0.0" },
        capabilities: null,
      },
    });
  });
}

const dateKey = (date) => date.toISOString().slice(0, 10);

function startOfWeek(date) {
  const result = new Date(`${dateKey(date)}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() - result.getUTCDay());
  return result;
}

function shortNumber(value) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render({ summary, dailyUsageBuckets = [] }) {
  const usage = new Map(dailyUsageBuckets.map(({ startDate, tokens }) => [startDate, tokens]));
  const latestBucket = dailyUsageBuckets.at(-1)?.startDate;
  const today = new Date();
  const endDate = latestBucket && latestBucket > dateKey(today)
    ? new Date(`${latestBucket}T00:00:00Z`)
    : today;
  const gridEnd = startOfWeek(endDate);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + 6);
  const gridStart = new Date(gridEnd);
  gridStart.setUTCDate(gridStart.getUTCDate() - (DAYS - 1));

  const visibleValues = [];
  for (let i = 0; i < DAYS; i += 1) {
    const date = new Date(gridStart);
    date.setUTCDate(date.getUTCDate() + i);
    const value = usage.get(dateKey(date)) ?? 0;
    if (value > 0) visibleValues.push(value);
  }

  const sorted = visibleValues.toSorted((a, b) => a - b);
  const quantile = (ratio) => sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0;
  const thresholds = [quantile(0.2), quantile(0.4), quantile(0.6), quantile(0.8)];
  const colors = ["#1b2433", "#12324a", "#0f4c5c", "#0b7285", "#14b8a6", "#5eead4"];
  const levelFor = (value) => {
    if (!value) return 0;
    return 1 + thresholds.filter((threshold) => value > threshold).length;
  };

  const width = 1000;
  const height = 270;
  const cell = 12;
  const gap = 4;
  const left = 88;
  const top = 112;
  const dayLabels = [[1, "Mon"], [3, "Wed"], [5, "Fri"]];
  const cells = [];
  const monthLabels = [];
  let previousMonth = -1;

  for (let i = 0; i < DAYS; i += 1) {
    const date = new Date(gridStart);
    date.setUTCDate(date.getUTCDate() + i);
    const week = Math.floor(i / 7);
    const day = date.getUTCDay();
    const key = dateKey(date);
    const value = usage.get(key) ?? 0;
    const x = left + week * (cell + gap);
    const y = top + day * (cell + gap);

    cells.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colors[levelFor(value)]}">` +
      `<title>${escapeXml(key)}: ${value.toLocaleString("en")} tokens</title></rect>`,
    );

    if (day === 0 && date.getUTCMonth() !== previousMonth) {
      previousMonth = date.getUTCMonth();
      monthLabels.push(
        `<text x="${x}" y="98" class="month">${date.toLocaleString("en", { month: "short", timeZone: "UTC" })}</text>`,
      );
    }
  }

  const activeDays = visibleValues.length;
  const lastUpdated = latestBucket ?? dateKey(today);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Pay4att's Codex daily activity</title>
  <desc id="desc">${activeDays} active days in the last year and a ${summary.currentStreakDays ?? 0} day current streak.</desc>
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
  <text x="32" y="38" class="eyebrow">CODEX / DAILY ACTIVITY</text>
  <text x="32" y="70" class="stat">${shortNumber(summary.lifetimeTokens)} <tspan class="label">lifetime tokens</tspan></text>
  <text x="330" y="70" class="stat">${summary.currentStreakDays ?? 0} <tspan class="label">day streak</tspan></text>
  <text x="530" y="70" class="stat">${activeDays} <tspan class="label">active days / year</tspan></text>
  <text x="968" y="38" text-anchor="end" class="label">Updated ${escapeXml(lastUpdated)}</text>
  ${monthLabels.join("\n  ")}
  ${dayLabels.map(([day, label]) => `<text x="32" y="${top + day * (cell + gap) + 10}" class="day">${label}</text>`).join("\n  ")}
  ${cells.join("\n  ")}
  <text x="32" y="247" class="label">Less</text>
  ${colors.map((color, index) => `<rect x="${67 + index * 19}" y="237" width="12" height="12" rx="3" fill="${color}" />`).join("\n  ")}
  <text x="187" y="247" class="label">More</text>
  <rect x="790" y="237" width="178" height="2" rx="1" fill="url(#accent)" opacity=".75" />
</svg>
`;
}

const usage = await readUsage();
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(usage), "utf8");
console.log(`Updated ${path.relative(ROOT, OUTPUT)}`);
