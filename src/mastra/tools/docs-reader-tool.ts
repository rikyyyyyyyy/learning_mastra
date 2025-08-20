import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const docsReaderTool = createTool({
  id: 'docs-reader',
  description: 'docs/ 以下のルール・仕様ドキュメントを読み取り、指定範囲のテキストを返します',
  inputSchema: z.object({
    path: z.string().describe('学習用ルールドキュメントの相対パス。例: docs/rules/slide-html-rules.md'),
    startMarker: z.string().optional().describe('抽出開始を示すマーカー文字列'),
    endMarker: z.string().optional().describe('抽出終了を示すマーカー文字列'),
    maxChars: z.number().int().positive().optional().default(8000).describe('返却する最大文字数'),
  }),
  outputSchema: z.object({
    content: z.string().describe('抽出されたテキストコンテンツ'),
    from: z.string().describe('読み取ったファイルパス'),
    truncated: z.boolean().default(false).describe('最大文字数で切り詰めたかどうか'),
  }),
  execute: async ({ context }) => {
    const { path, startMarker, endMarker, maxChars } = context as {
      path: string;
      startMarker?: string;
      endMarker?: string;
      maxChars?: number;
    };

    try {
      const fs = await import('fs');
      const nodePath = await import('path');

      const absolutePath = nodePath.isAbsolute(path) ? path : nodePath.join(process.cwd(), path);
      if (!fs.existsSync(absolutePath)) {
        return { content: '', from: path, truncated: false };
      }

      const raw = fs.readFileSync(absolutePath, 'utf8');
      let sliced = raw;

      if (startMarker) {
        const idx = raw.indexOf(startMarker);
        if (idx >= 0) {
          sliced = raw.slice(idx + startMarker.length);
        }
      }
      if (endMarker) {
        const endIdx = sliced.indexOf(endMarker);
        if (endIdx >= 0) {
          sliced = sliced.slice(0, endIdx);
        }
      }

      let truncated = false;
      if (sliced.length > (maxChars ?? 8000)) {
        truncated = true;
        sliced = sliced.slice(0, maxChars);
      }

      return { content: sliced, from: path, truncated };
    } catch (e) {
      return { content: '', from: path, truncated: false };
    }
  },
});

