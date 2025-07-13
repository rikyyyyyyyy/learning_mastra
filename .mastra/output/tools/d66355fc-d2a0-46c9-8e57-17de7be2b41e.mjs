import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getJobResult } from './b0d9adbf-1685-4da8-a5b5-c772a7b99734.mjs';
import 'fs';
import 'path';

const jobResultTool = createTool({
  id: "job-result-fetch",
  description: "\u30B8\u30E7\u30D6ID\u3092\u6307\u5B9A\u3057\u3066\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u5B9F\u884C\u7D50\u679C\u3092\u53D6\u5F97\u3057\u307E\u3059\u3002\u5B8C\u4E86\u3057\u305F\u30B8\u30E7\u30D6\u306E\u8A73\u7D30\u306A\u7D50\u679C\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3067\u304D\u307E\u3059\u3002",
  inputSchema: z.object({
    jobId: z.string().describe("\u7D50\u679C\u3092\u53D6\u5F97\u3057\u305F\u3044\u30B8\u30E7\u30D6ID")
  }),
  outputSchema: z.object({
    jobId: z.string(),
    found: z.boolean(),
    result: z.any().optional(),
    completedAt: z.string().optional(),
    workflowId: z.string().optional(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { jobId } = context;
    const jobResult = getJobResult(jobId);
    if (!jobResult) {
      return {
        jobId,
        found: false,
        message: `\u30B8\u30E7\u30D6ID\u300C${jobId}\u300D\u306E\u7D50\u679C\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30B8\u30E7\u30D6\u304C\u5B8C\u4E86\u3057\u3066\u3044\u306A\u3044\u304B\u3001\u5B58\u5728\u3057\u306A\u3044\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002`
      };
    }
    return {
      jobId,
      found: true,
      result: jobResult.result,
      completedAt: jobResult.completedAt.toISOString(),
      workflowId: jobResult.workflowId,
      message: `\u30B8\u30E7\u30D6ID\u300C${jobId}\u300D\u306E\u7D50\u679C\u3092\u6B63\u5E38\u306B\u53D6\u5F97\u3057\u307E\u3057\u305F\u3002`
    };
  }
});

export { jobResultTool };
//# sourceMappingURL=d66355fc-d2a0-46c9-8e57-17de7be2b41e.mjs.map
