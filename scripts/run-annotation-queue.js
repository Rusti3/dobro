import { createPool, runMigrations } from "../server/database.js";
import { createCatalogRepository } from "../server/catalog-repository.js";
import { processAnnotationQueue, recoverStaleAnnotationJobs } from "../server/annotation-worker.js";
import { createStore } from "../server/store.js";

const pool = createPool({ applicationName: "dobrie_dela_manual_annotations" });
try {
  await runMigrations(pool);
  const catalogRepository = createCatalogRepository(pool);
  const store = createStore(pool);
  await recoverStaleAnnotationJobs(pool);
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  do {
  const result = await processAnnotationQueue({
    pool,
    catalogRepository,
    concurrency: Number.parseInt(process.env.ANNOTATION_CONCURRENCY || "5", 10),
    maxJobs: Number.parseInt(process.env.ANNOTATION_BATCH_SIZE || "100", 10),
    diverse: process.argv.includes("--pilot"),
  });
  await store.setMeta("last_annotation_batch", JSON.stringify({ ...result, at: new Date().toISOString(), runtime: "external" }));
  console.log(JSON.stringify(result, null, 2));
  if (!process.argv.includes("--drain") || stopping) break;
  if (result.failed && result.status !== "paused" && result.failed / (result.failed + result.completed) > 0.1) throw new Error("More than 10% annotation validation failures; inspect pilot before continuing");
  const counts = await catalogRepository.counts();
  if (!counts.eligible_pending_annotations && !counts.processing_annotations) break;
  if (!result.completed || result.status === "paused") await new Promise((resolve) => setTimeout(resolve, 15000));
  await recoverStaleAnnotationJobs(pool);
  } while (!stopping);
} finally {
  await pool.end();
}

