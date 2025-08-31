// Lightweight sanity test for the worker network router
import { createWorkerNetwork } from '../networks/worker-network';

async function main() {
  const wn = createWorkerNetwork({ modelKey: 'claude-sonnet-4' });

  const thread = 'test-job:test-task';

  const searchRes = await wn.generateForTask(
    { taskType: 'web-search', description: '最新の研究動向を調査' },
    [{ role: 'user', content: 'AIエージェントの最新動向を要約してください。必要なら検索してOK。' }],
    { memory: { thread, resource: thread } }
  );
  console.log('[search] chosen=', searchRes.chosen, 'len=', searchRes.text?.length ?? 0);

  const codeRes = await wn.generateForTask(
    { taskType: 'code', description: 'HTMLスライドの雛形を生成' },
    [{ role: 'user', content: '最低限のHTMLスライド雛形を作ってください。' }],
    { memory: { thread, resource: thread } }
  );
  console.log('[code] chosen=', codeRes.chosen, 'len=', codeRes.text?.length ?? 0);
}

// Only run if invoked directly via tsx
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

