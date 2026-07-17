#!/usr/bin/env node
/**
 * One-shot team deployment helper.
 *
 * Usage:
 *   node scripts/setup-team.mjs
 *
 * Requires (interactive, browser):
 *   - clasp login
 *   - vercel login (if not already)
 *
 * Requires env / prompts:
 *   - Google Sheet URL or ID
 *   - TEAM_PASSCODE
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gasDir = path.join(root, "google-apps-script");
const claspPath = path.join(gasDir, ".clasp.json");

function run(cmd, args, opts = {}) {
  console.log(`\n→ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd || root,
    env: process.env,
    shell: false,
  });
  if (result.status !== 0 && !opts.allowFail) {
    process.exit(result.status || 1);
  }
  return result.status || 0;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

function extractSheetId(input) {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input)) return input;
  return null;
}

function extractWebAppUrl(deployOutput) {
  const text = String(deployOutput || "");
  const match = text.match(/https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec/);
  return match ? match[0] : null;
}

async function main() {
  console.log(`
Call Queue — team deployment setup
==================================

Automated:
  • clasp push + deploy Apps Script web app
  • vercel env add for TEAM_PASSCODE / SHEET_WRITE_URL / VITE_SHEET_URL
  • vercel redeploy

You still do by hand (once):
  • Approve clasp login + vercel login in browser
  • Sheet sharing → Anyone with the link — Viewer
`);

  // --- Auth checks ---
  console.log("\n[1/5] Checking clasp login…");
  const claspWho = spawnSync("npx", ["clasp", "list"], {
    cwd: root,
    encoding: "utf8",
  });
  if (claspWho.status !== 0) {
    console.log("\nOpening browser for clasp login. Approve access, then come back here.\n");
    run("npx", ["clasp", "login"]);
  } else {
    console.log("clasp is logged in.");
  }

  console.log("\n[2/5] Checking Vercel login…");
  const vercelWho = spawnSync("npx", ["vercel", "whoami"], {
    cwd: root,
    encoding: "utf8",
  });
  if (vercelWho.status !== 0) {
    console.log("\nOpening browser for Vercel login. Approve access, then come back here.\n");
    run("npx", ["vercel", "login"]);
  } else {
    console.log(`Vercel logged in as: ${(vercelWho.stdout || "").trim()}`);
  }

  // --- Sheet ---
  console.log("\n[3/5] Google Sheet");
  const sheetInput = await ask(
    "Paste your Google Sheet URL (or spreadsheet ID):\n> "
  );
  const sheetId = extractSheetId(sheetInput);
  if (!sheetId) {
    console.error("Could not parse a spreadsheet ID from that input.");
    process.exit(1);
  }
  const sheetUrl = sheetInput.includes("http")
    ? sheetInput
    : `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

  const passcode = await ask("Team passcode (e.g. PULSE):\n> ");
  if (!passcode) {
    console.error("Passcode is required.");
    process.exit(1);
  }

  // --- Apps Script ---
  console.log("\n[4/5] Apps Script (clasp)");
  if (!existsSync(claspPath)) {
    console.log("Creating Apps Script project bound to your sheet…");
    run("npx", [
      "clasp",
      "create",
      "--type",
      "sheets",
      "--title",
      "Call Queue Writeback",
      "--parentId",
      sheetId,
      "--rootDir",
      gasDir,
    ]);
  } else {
    console.log(`Using existing ${claspPath}`);
  }

  run("npx", ["clasp", "push", "--force"], { cwd: gasDir });

  console.log("Creating web app deployment…");
  const deploy = spawnSync(
    "npx",
    ["clasp", "deploy", "--description", "Call Queue write API"],
    { cwd: gasDir, encoding: "utf8" }
  );
  process.stdout.write(deploy.stdout || "");
  process.stderr.write(deploy.stderr || "");
  if (deploy.status !== 0) {
    console.error("clasp deploy failed. You may need to open Extensions → Apps Script and Deploy → New deployment once manually.");
    process.exit(deploy.status || 1);
  }

  let writeUrl = extractWebAppUrl(deploy.stdout);
  if (!writeUrl) {
    // clasp often prints deployment ID; try listing deployments
    const listed = spawnSync("npx", ["clasp", "deployments"], {
      cwd: gasDir,
      encoding: "utf8",
    });
    process.stdout.write(listed.stdout || "");
    writeUrl = extractWebAppUrl(listed.stdout);
  }

  if (!writeUrl) {
    writeUrl = await ask(
      "\nPaste the Web App URL from clasp output (ends with /exec):\n> "
    );
  }

  if (!writeUrl.includes("/exec")) {
    console.error("That doesn't look like a Web App /exec URL.");
    process.exit(1);
  }

  console.log(`\nSHEET_WRITE_URL = ${writeUrl}`);

  // Persist local env for convenience (not committed)
  const envLocal = [
    `TEAM_PASSCODE=${passcode}`,
    `SHEET_WRITE_URL=${writeUrl}`,
    `VITE_SHEET_URL=${sheetUrl}`,
    "",
  ].join("\n");
  writeFileSync(path.join(root, ".env.local"), envLocal);
  console.log("Wrote .env.local (gitignored).");

  // --- Vercel env ---
  console.log("\n[5/5] Vercel env + redeploy");
  console.log("Linking project if needed…");
  run("npx", ["vercel", "link", "--yes"], { allowFail: true });

  // Remove + re-add is awkward interactively; use vercel env add with stdin
  for (const [key, value, targets] of [
    ["TEAM_PASSCODE", passcode, ["production", "preview", "development"]],
    ["SHEET_WRITE_URL", writeUrl, ["production", "preview", "development"]],
    ["VITE_SHEET_URL", sheetUrl, ["production", "preview", "development"]],
  ]) {
    for (const target of targets) {
      // vercel env add NAME environment < value
      const add = spawnSync(
        "npx",
        ["vercel", "env", "add", key, target, "--force"],
        {
          cwd: root,
          input: `${value}\n`,
          encoding: "utf8",
        }
      );
      if (add.status === 0) {
        console.log(`✓ ${key} → ${target}`);
      } else {
        console.log(`⚠ Could not set ${key} for ${target}:`);
        process.stdout.write(add.stdout || "");
        process.stderr.write(add.stderr || "");
      }
    }
  }

  console.log("\nTriggering production redeploy…");
  run("npx", ["vercel", "--prod", "--yes"]);

  console.log(`
========================================
Done (almost)

Automated:
  ✓ Apps Script pushed + deployed
  ✓ Vercel env vars set
  ✓ Production redeploy triggered

You still must do this once in Google Sheets:
  1. Open: ${sheetUrl}
  2. Share → Anyone with the link → Viewer
  3. Confirm columns exist: Status, Called By, Notes

Then open your Vercel URL, enter passcode "${passcode}", and tap Load team sheet.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
