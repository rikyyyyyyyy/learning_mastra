import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getJobResult } from './b0d9adbf-1685-4da8-a5b5-c772a7b99734.mjs';
import 'fs';
import 'path';

const slidePreviewTool = createTool({
  id: "slide-preview-display",
  description: "\u30B9\u30E9\u30A4\u30C9\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u8868\u793A\u3059\u308B\u305F\u3081\u306E\u30C8\u30EA\u30AC\u30FC\u30C4\u30FC\u30EB\u3067\u3059\u3002\u3053\u306E\u30C4\u30FC\u30EB\u304C\u5B9F\u884C\u3055\u308C\u308B\u3068\u3001\u30D5\u30ED\u30F3\u30C8\u30A8\u30F3\u30C9\u304C\u81EA\u52D5\u7684\u306B\u30B9\u30E9\u30A4\u30C9\u306E\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u8868\u793A\u3057\u307E\u3059\u3002",
  inputSchema: z.object({
    jobId: z.string().describe("\u30D7\u30EC\u30D3\u30E5\u30FC\u3057\u305F\u3044\u30B9\u30E9\u30A4\u30C9\u751F\u6210\u30B8\u30E7\u30D6\u306EID")
  }),
  outputSchema: z.object({
    jobId: z.string(),
    previewReady: z.boolean(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { jobId } = context;
    console.log(`\u{1F5BC}\uFE0F \u30B9\u30E9\u30A4\u30C9\u30D7\u30EC\u30D3\u30E5\u30FC\u30C8\u30EA\u30AC\u30FC\u5B9F\u884C (jobId: ${jobId})`);
    const jobResult = getJobResult(jobId);
    if (!jobResult) {
      return {
        jobId,
        previewReady: false,
        message: `\u30B8\u30E7\u30D6ID\u300C${jobId}\u300D\u306E\u7D50\u679C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u30B9\u30E9\u30A4\u30C9\u751F\u6210\u304C\u5B8C\u4E86\u3057\u3066\u3044\u306A\u3044\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002`
      };
    }
    if (jobResult.workflowId !== "slideGenerationWorkflow") {
      return {
        jobId,
        previewReady: false,
        message: `\u30B8\u30E7\u30D6ID\u300C${jobId}\u300D\u306F\u30B9\u30E9\u30A4\u30C9\u751F\u6210\u30B8\u30E7\u30D6\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002`
      };
    }
    const slideResult = jobResult.result;
    if (!slideResult || typeof slideResult !== "object" || !("htmlCode" in slideResult) || !slideResult.htmlCode) {
      return {
        jobId,
        previewReady: false,
        message: `\u30B8\u30E7\u30D6ID\u300C${jobId}\u300D\u306E\u30B9\u30E9\u30A4\u30C9HTML\u30B3\u30FC\u30C9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002`
      };
    }
    console.log(`\u2705 \u30B9\u30E9\u30A4\u30C9\u30D7\u30EC\u30D3\u30E5\u30FC\u6E96\u5099\u5B8C\u4E86 (jobId: ${jobId})`);
    return {
      jobId,
      previewReady: true,
      message: `\u30B9\u30E9\u30A4\u30C9\u30D7\u30EC\u30D3\u30E5\u30FC\u306E\u6E96\u5099\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002\u30D7\u30EC\u30D3\u30E5\u30FC\u304C\u81EA\u52D5\u7684\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002`
    };
  }
});

export { slidePreviewTool };
//# sourceMappingURL=950a7c10-a632-40c1-81ca-96413e7652b6.mjs.map
