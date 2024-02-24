import { $, sleep } from "zx";
import ky from "ky";
import fs from "fs/promises";

import { runTests } from "./test";

const FOUNDRY_ORG = "foundry-rs";
const FOUNDRY_PACKAGE = "foundry";

$.verbose = false;

async function main() {
  const dockerComposeTemplate = await fs.readFile("./compose.template.yml", "utf-8");

  const gh = ky.extend({
    hooks: {
      beforeRequest: [
        (request) => {
          request.headers.set("Authorization", `Bearer ${process.env.GITHUB_TOKEN}`);
          request.headers.set("X-GitHub-Api-Version", `2022-11-28`);
        },
      ],
    },
  });

  const taggedVersions: any = await Promise.all(
    new Array(8)
      .fill(0)
      .map((_, i) => i + 1)
      .map((e) =>
        gh
          .get(
            `https://api.github.com/orgs/${FOUNDRY_ORG}/packages/container/${FOUNDRY_PACKAGE}/versions?per_page=100&page=${e}`,
          )
          .json(),
      ),
  ).then((e) => {
    return e.flat();
  });

  console.log("First Date:", taggedVersions[0].created_at);
  console.log("Last Date:", taggedVersions[taggedVersions.length - 1].created_at);

  let processedEntries = 0;

  for (const version of taggedVersions) {
    if (version.metadata.container.tags.length > 0) {
      const versionTag = version.metadata.container.tags.find((e: any) => e.startsWith("nightly-"));

      if (new Date(version.created_at) < new Date("2023-05-01T00:00:00Z")) {
        console.log("I guess we're done!");

        break;
      }

      if (versionTag) {
        const versionObject = await fs.readFile("./data/processedVersions.json", "utf-8").then((e) => JSON.parse(e));

        if (versionObject[versionTag]) {
          console.log("Skipping:", versionTag);

          continue;
        }

        console.log("Starting docker with:", versionTag);

        await fs.writeFile("./compose.yml", dockerComposeTemplate.replace("$$$VERSION_TAG$$$", versionTag));
        await $`docker compose -f compose.yml up -d`;

        console.log("Waiting for container to stabilize...");
        await sleep("7s"); // Just wait a bit for the container to stabilize

        console.log("Starting benchmark with:", versionTag);
        performance.mark("bench-start");
        await $`yarn benchmark`;
        performance.mark("bench-end");

        // Tests are NOT a part of the benchmark.
        const testingResults = await runTests();

        versionObject[versionTag] = {
          tag: versionTag,
          date: version.created_at,
          perf: performance.measure("bench", "bench-start", "bench-end"),
          testingResults,
        };

        console.log("Benchmark Complete:", versionObject[versionTag]);

        await $`docker stop $(docker ps -aq) || docker rm -f $(docker ps -aq)`;
        await $`docker system prune -a --volumes -f`;

        await fs.rm("./compose.yml", { force: true });
        await fs.writeFile("./data/processedVersions.json", JSON.stringify(versionObject, null, 2));

        processedEntries += 1;
      }
    }
  }

  console.log("Total Entries Processed:", processedEntries);
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
