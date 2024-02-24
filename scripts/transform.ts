import fs from "fs/promises";

async function main() {
  await fs.rm("./data/transformed.json", { force: true });

  const versionObject: any = await fs.readFile("./data/processedVersions.json", "utf-8").then((e) => JSON.parse(e));
  const valuesObject = Object.values(versionObject);
  const transformedData = valuesObject.map((e: any) => ({ ...e, date: e.date.slice(0, -1) })); // removing the Z (UTC indicator) because chart doesn't like it.

  console.log(`Found ${transformedData.length} entries.`);

  await fs.writeFile("./data/transformed.json", JSON.stringify(transformedData));
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
