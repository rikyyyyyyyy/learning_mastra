import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const JOB_RESULTS_DIR = path.join(process.cwd(), ".job-results");
if (!fs.existsSync(JOB_RESULTS_DIR)) {
  fs.mkdirSync(JOB_RESULTS_DIR, { recursive: true });
}
const jobStatusStore = /* @__PURE__ */ new Map();
const jobStatusTool = createTool({
  id: "job-status-check",
  description: "\u30B8\u30E7\u30D6ID\u3092\u6307\u5B9A\u3057\u3066\u30B8\u30E7\u30D6\u306E\u5B9F\u884C\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u307E\u3059",
  inputSchema: z.object({
    jobId: z.string().describe("\u78BA\u8A8D\u3057\u305F\u3044\u30B8\u30E7\u30D6ID")
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(["queued", "running", "completed", "failed", "not_found"]),
    message: z.string(),
    result: z.any().optional(),
    error: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { jobId } = context;
    const jobInfo = jobStatusStore.get(jobId);
    if (!jobInfo) {
      return {
        jobId,
        status: "not_found",
        message: `\u30B8\u30E7\u30D6ID\u300C${jobId}\u300D\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F`
      };
    }
    const response = {
      jobId,
      status: jobInfo.status,
      message: getStatusMessage(jobInfo.status),
      result: jobInfo.result,
      error: jobInfo.error,
      startedAt: jobInfo.startedAt?.toISOString(),
      completedAt: jobInfo.completedAt?.toISOString()
    };
    return response;
  }
});
function updateJobStatus(jobId, status, options) {
  const existing = jobStatusStore.get(jobId) || { status: "queued" };
  const updated = {
    ...existing,
    status,
    ...options?.result ? { result: options.result } : {},
    ...options?.error ? { error: options.error } : {},
    ...status === "running" && !existing.startedAt ? { startedAt: /* @__PURE__ */ new Date() } : {},
    ...status === "completed" || status === "failed" ? { completedAt: /* @__PURE__ */ new Date() } : {}
  };
  jobStatusStore.set(jobId, updated);
  console.log(`\u{1F4CA} \u30B8\u30E7\u30D6\u72B6\u614B\u66F4\u65B0: ${jobId} -> ${status}`);
}
function initializeJob(jobId) {
  jobStatusStore.set(jobId, {
    status: "queued",
    startedAt: /* @__PURE__ */ new Date()
  });
}
function storeJobResult(jobId, result, workflowId = "unknown") {
  const jobResult = {
    jobId,
    result,
    completedAt: (/* @__PURE__ */ new Date()).toISOString(),
    workflowId
  };
  const filePath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(jobResult, null, 2));
    console.log(`\u{1F4BE} \u30B8\u30E7\u30D6\u7D50\u679C\u3092\u30D5\u30A1\u30A4\u30EB\u306B\u4FDD\u5B58: ${filePath}`);
  } catch (error) {
    console.error(`\u274C \u30B8\u30E7\u30D6\u7D50\u679C\u306E\u4FDD\u5B58\u306B\u5931\u6557: ${error}`);
  }
}
function getJobResult(jobId) {
  console.log(`\u{1F50D} \u30B8\u30E7\u30D6\u7D50\u679C\u3092\u691C\u7D22: ${jobId}`);
  const filePath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const result = JSON.parse(data);
      console.log(`\u2705 \u30B8\u30E7\u30D6\u7D50\u679C\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F: ${jobId} (\u30D5\u30A1\u30A4\u30EB: ${filePath})`);
      result.completedAt = new Date(result.completedAt);
      return result;
    } else {
      console.log(`\u274C \u30B8\u30E7\u30D6\u7D50\u679C\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093: ${filePath}`);
      const files = fs.readdirSync(JOB_RESULTS_DIR);
      console.log(`\u{1F4C1} \u5229\u7528\u53EF\u80FD\u306A\u30B8\u30E7\u30D6\u7D50\u679C: ${files.join(", ")}`);
    }
  } catch (error) {
    console.error(`\u274C \u30B8\u30E7\u30D6\u7D50\u679C\u306E\u8AAD\u307F\u8FBC\u307F\u30A8\u30E9\u30FC: ${error}`);
  }
  return null;
}
function getCompletedJobs() {
  try {
    const files = fs.readdirSync(JOB_RESULTS_DIR);
    return files.filter((file) => file.endsWith(".json")).map((file) => file.replace(".json", ""));
  } catch (error) {
    console.error(`\u274C \u30B8\u30E7\u30D6\u4E00\u89A7\u306E\u53D6\u5F97\u30A8\u30E9\u30FC: ${error}`);
    return [];
  }
}
function getStatusMessage(status) {
  switch (status) {
    case "queued":
      return "\u30B8\u30E7\u30D6\u306F\u5B9F\u884C\u5F85\u3061\u3067\u3059";
    case "running":
      return "\u30B8\u30E7\u30D6\u3092\u5B9F\u884C\u4E2D\u3067\u3059";
    case "completed":
      return "\u30B8\u30E7\u30D6\u304C\u6B63\u5E38\u306B\u5B8C\u4E86\u3057\u307E\u3057\u305F";
    case "failed":
      return "\u30B8\u30E7\u30D6\u306E\u5B9F\u884C\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
    default:
      return "\u4E0D\u660E\u306A\u72B6\u614B\u3067\u3059";
  }
}

export { getCompletedJobs, getJobResult, initializeJob, jobStatusTool, storeJobResult, updateJobStatus };
//# sourceMappingURL=b0d9adbf-1685-4da8-a5b5-c772a7b99734.mjs.map
