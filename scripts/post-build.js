import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import {chmod} from "fs/promises";

await import("./correct-import-extensions.js");


await chmod("./esnext/cli.js", 0x755);

const { pathname } = new URL(import.meta.url);
const cwd = resolve(dirname(pathname), "..");

if (!process.env.NO_COVERAGE_BADGE_UPDATE) {
  const badges = [];

  const { name } = await fs.readFile("package.json", "utf-8").then(JSON.parse);

  badges.push(
    "### Support\n\n",
    "![Node.js supported](https://img.shields.io/badge/node-%3E%3D18.7.0-blue)",
  );
  //
  // badges.push(
  //   "\n\n### Test Coverage\n\n"
  //   // `![nycrc config on GitHub](https://img.shields.io/nycrc/${name.replace(/^@/, "")})`
  // );
  //
  // // const wptResults = await fs
  // //   .readFile("coverage/wpt.results.json", "utf8")
  // //   .then(JSON.parse)
  // //   .catch(() => ({}));
  // // if (wptResults?.total) {
  // //   const message = `${wptResults.pass}/${wptResults.total}`;
  // //   const name = "Web Platform Tests";
  // //   badges.push(
  // //     `![${name} ${message}](https://img.shields.io/badge/${encodeURIComponent(
  // //       name
  // //     )}-${encodeURIComponent(message)}-brightgreen)`
  // //   );
  // // }
  //
  // const coverage = await fs
  //   .readFile("coverage/coverage-summary.json", "utf8")
  //   .then(JSON.parse)
  //   .catch(() => ({}));
  // const coverageConfig = await fs.readFile(".nycrc", "utf8").then(JSON.parse);
  // for (const [name, { pct }] of Object.entries(coverage?.total ?? {})) {
  //   const good = coverageConfig[name];
  //   if (!good) continue; // not configured
  //   const color = pct >= good ? "brightgreen" : "yellow";
  //   const message = `${pct}%25`;
  //   badges.push(
  //     `![${message} ${name} covered](https://img.shields.io/badge/${name}-${message}-${color})`
  //   );
  // }

  const tag = "[//]: # (badges)";

  const readMe = await fs.readFile("README.md", "utf8");
  const badgeStart = readMe.indexOf(tag);
  const badgeStartAfter = badgeStart + tag.length;
  if (badgeStart === -1) {
    throw new Error(`Expected to find "${tag}" in README.md`);
  }
  const badgeEnd = badgeStartAfter + readMe.slice(badgeStartAfter).indexOf(tag);
  const badgeEndAfter = badgeEnd + tag.length;
  const readMeBefore = readMe.slice(0, badgeStart);
  const readMeAfter = readMe.slice(badgeEndAfter);

  const readMeNext = `${readMeBefore}${tag}\n\n${badges.join(
    " "
  )}\n\n${tag}${readMeAfter}`;
  await fs.writeFile("README.md", readMeNext);
  // console.log("Wrote coverage badges!");
}
