import { $, sleep } from "zx";
import ky from "ky";
import fs from "fs/promises";

const FOUNDRY_ORG = "foundry-rs";
const FOUNDRY_PACKAGE = "foundry";

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

  // Last 200 versions.
  const taggedVersions: any = await Promise.all([
    await gh
      .get(
        `https://api.github.com/orgs/${FOUNDRY_ORG}/packages/container/${FOUNDRY_PACKAGE}/versions?per_page=100&page=1`,
      )
      .json(),
    await gh
      .get(
        `https://api.github.com/orgs/${FOUNDRY_ORG}/packages/container/${FOUNDRY_PACKAGE}/versions?per_page=100&page=2`,
      )
      .json(),
  ]).then((e) => {
    return e.flat();
  });

  let processedVersions = 0;

  for (const version of taggedVersions) {
    if (processedVersions > 50) {
      // We only wanna do ~50 versions at a time.
      break;
    }

    if (version.metadata.container.tags.length > 0) {
      const versionTag = version.metadata.container.tags.find((e: any) => e.startsWith("nightly-"));

      if (versionTag) {
        const versionObject = await fs.readFile("./data/processedVersions.json", "utf-8").then((e) => JSON.parse(e));

        if (versionObject[versionTag]) {
          console.log("Skipping:", versionTag);

          continue;
        }

        console.log("Starting docker with:", versionTag);
        console.log("Local Run ID:", processedVersions);
        await fs.rm("./compose.yml", { force: true });
        await fs.writeFile("./compose.yml", dockerComposeTemplate.replace("$$$VERSION_TAG$$$", versionTag));
        await $`docker compose -f compose.yml up -d`;

        await sleep("10s"); // Just wait 10s for the container to stabilize

        console.log("Starting benchmark with:", versionTag);
        performance.mark("bench-start");
        await $`yarn benchmark`;
        performance.mark("bench-end");

        const perfData = performance.measure("bench", "bench-start", "bench-end");
        console.log(perfData);

        await $`docker stop $(docker ps -aq) || docker rm -f $(docker ps -aq)`;
        await $`docker system prune -a --volumes -f`;

        versionObject[versionTag] = {
          tag: versionTag,
          date: version.created_at,
          perf: perfData,
        };
        console.log("Benchmark Complete:", versionObject[versionTag]);

        await fs.writeFile("./data/processedVersions.json", JSON.stringify(versionObject, null, 2));
        processedVersions += 1;
      }
    }
  }
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
