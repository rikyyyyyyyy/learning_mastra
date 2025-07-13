import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { initializeJob, updateJobStatus, storeJobResult } from './b0d9adbf-1685-4da8-a5b5-c772a7b99734.mjs';
import 'fs';
import 'path';

const webSearchTool = createTool({
  id: "web-search-queue",
  description: "Web\u691C\u7D22\u30B8\u30E7\u30D6\u3092\u30AD\u30E5\u30FC\u306B\u767B\u9332\u3057\u3001jobId\u3092\u5373\u5EA7\u306B\u8FD4\u3057\u307E\u3059\u3002\u5B9F\u969B\u306E\u691C\u7D22\u51E6\u7406\u306F\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u3067\u975E\u540C\u671F\u5B9F\u884C\u3055\u308C\u307E\u3059\u3002",
  inputSchema: z.object({
    query: z.string().describe("\u691C\u7D22\u30AF\u30A8\u30EA"),
    maxResults: z.number().describe("\u6700\u5927\u691C\u7D22\u7D50\u679C\u6570"),
    language: z.string().describe("\u691C\u7D22\u8A00\u8A9E")
  }),
  outputSchema: z.object({
    jobId: z.string().describe("\u30B8\u30E7\u30D6ID"),
    status: z.literal("queued").describe("\u30B8\u30E7\u30D6\u30B9\u30C6\u30FC\u30BF\u30B9"),
    message: z.string().describe("\u30B9\u30C6\u30FC\u30BF\u30B9\u30E1\u30C3\u30BB\u30FC\u30B8"),
    estimatedTime: z.string().describe("\u63A8\u5B9A\u5B8C\u4E86\u6642\u9593")
  }),
  execute: async ({ context, runtimeContext }) => {
    const { query, maxResults = 5, language = "ja" } = context;
    const jobId = `web-search-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    initializeJob(jobId);
    const response = {
      jobId,
      status: "queued",
      message: `Web\u691C\u7D22\u30B8\u30E7\u30D6\u300C${query}\u300D\u3092\u30AD\u30E5\u30FC\u306B\u767B\u9332\u3057\u307E\u3057\u305F`,
      estimatedTime: "30-60\u79D2\u7A0B\u5EA6"
    };
    setTimeout(() => {
      import('../index2.mjs').then(({ mastra: mastraInstance }) => {
        if (mastraInstance) {
          executeWorkflowInBackground(mastraInstance, jobId, { query, maxResults, language }, runtimeContext).catch((error) => {
            console.error(`\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u5B9F\u884C\u30A8\u30E9\u30FC (jobId: ${jobId}):`, error);
          });
        } else {
          console.error(`Mastra\u30A4\u30F3\u30B9\u30BF\u30F3\u30B9\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093 (jobId: ${jobId})`);
          updateJobStatus(jobId, "failed", { error: "Mastra\u30A4\u30F3\u30B9\u30BF\u30F3\u30B9\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093" });
        }
      }).catch((error) => {
        console.error(`Mastra\u30A4\u30F3\u30B9\u30BF\u30F3\u30B9\u8AAD\u307F\u8FBC\u307F\u30A8\u30E9\u30FC (jobId: ${jobId}):`, error);
        updateJobStatus(jobId, "failed", { error: "Mastra\u30A4\u30F3\u30B9\u30BF\u30F3\u30B9\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F" });
      });
    }, 0);
    return response;
  }
});
async function executeWorkflowInBackground(mastra, jobId, inputData, runtimeContext) {
  try {
    console.log(`\u{1F680} \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u958B\u59CB (jobId: ${jobId})`);
    updateJobStatus(jobId, "running");
    const mastraInstance = mastra;
    const workflow = mastraInstance.getWorkflow("webSearchWorkflow");
    if (!workflow) {
      throw new Error("webSearchWorkflow\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    }
    const workflowInstance = workflow;
    const run = await workflowInstance.createRunAsync({ runId: jobId });
    run.watch((event) => {
      console.log(`\u{1F4CA} \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u9032\u6357 (${jobId}):`, event.type, event.payload?.id || "");
    });
    const result = await run.start({
      inputData,
      runtimeContext
    });
    if (result.status === "success") {
      console.log(`\u2705 \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u5B8C\u4E86 (jobId: ${jobId})`);
      const searchResult = result.result;
      console.log(`\u{1F4DD} \u30EC\u30DD\u30FC\u30C8\u751F\u6210\u5B8C\u4E86: ${searchResult?.metadata?.completedAt}`);
      updateJobStatus(jobId, "completed", { result: result.result });
      storeJobResult(jobId, result.result, "webSearchWorkflow");
    } else if (result.status === "failed") {
      console.error(`\u274C \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u5931\u6557 (jobId: ${jobId}):`, result.error);
      updateJobStatus(jobId, "failed", { error: result.error?.message || "Unknown error" });
    } else if (result.status === "suspended") {
      console.log(`\u23F8\uFE0F \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u4E2D\u65AD (jobId: ${jobId}):`, result.suspended);
    }
  } catch (error) {
    console.error(`\u{1F4A5} \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u5B9F\u884C\u4E2D\u306E\u81F4\u547D\u7684\u30A8\u30E9\u30FC (jobId: ${jobId}):`, error);
    updateJobStatus(jobId, "failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

export { webSearchTool };
//# sourceMappingURL=fc91f4c3-136f-4905-a84a-172506d60136.mjs.map
