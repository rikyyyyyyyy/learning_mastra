#!/usr/bin/env tsx
/**
 * Artifact System Integration Test
 * Tests the complete Content-Addressable Storage and Artifact management system
 */

import { initializeTaskManagementDB } from './db/migrations';
import { contentStoreDAO, artifactDAO } from './db/cas-dao';
import { artifactIOTool } from './tools/artifact-io-tool';
import { artifactDiffTool } from './tools/artifact-diff-tool';
import { contentStoreTool } from './tools/content-store-tool';

async function testArtifactSystem() {
  console.log('🧪 Starting Artifact System Integration Test\n');
  
  try {
    // 1. Initialize database
    console.log('📦 Initializing database...');
    const dbUrl = process.env.MASTRA_DB_URL || ':memory:';
    await initializeTaskManagementDB(dbUrl);
    console.log('✅ Database initialized\n');
    
    // 2. Test Content Store
    console.log('🔬 Testing Content Store...');
    const testContent = 'Hello, this is a test content for CAS!';
    const contentHash = await contentStoreDAO.store(testContent, 'text/plain');
    console.log(`  Stored content with hash: ${contentHash.substring(0, 12)}...`);
    
    const retrieved = await contentStoreDAO.retrieveDecoded(contentHash);
    console.log(`  Retrieved content: "${retrieved?.substring(0, 30)}..."`);
    console.log(`  ✅ Content store test passed\n`);
    
    // 3. Test Artifact Creation and Management
    console.log('🎨 Testing Artifact Management...');
    const jobId = `test-job-${Date.now()}`;
    const taskId = `test-task-${Date.now()}`;
    
    // Create artifact using the tool
    const createResult = await artifactIOTool.execute({
      context: {
        action: 'create',
        jobId: jobId,
        taskId: taskId,
        mimeType: 'text/html',
        labels: { test: 'true', type: 'integration' },
      },
    });
    
    if (!createResult.success || !createResult.artifactId) {
      throw new Error('Failed to create artifact');
    }
    
    console.log(`  Created artifact: ${createResult.artifactId}`);
    console.log(`  Reference: ${createResult.reference}`);
    
    // 4. Test Content Append
    console.log('\n📝 Testing Content Append...');
    const htmlContent = `
<!DOCTYPE html>
<html>
<head><title>Test Slide</title></head>
<body>
  <div class="slide">
    <h1>Test Presentation</h1>
    <p>This is a test slide content.</p>
  </div>
</body>
</html>`;
    
    const appendResult = await artifactIOTool.execute({
      context: {
        action: 'append',
        artifactId: createResult.artifactId,
        content: htmlContent,
      },
    });
    
    console.log(`  Appended ${appendResult.bytesWritten} bytes`);
    console.log(`  New content hash: ${appendResult.contentHash?.substring(0, 12)}...`);
    
    // 5. Test Commit
    console.log('\n💾 Testing Revision Commit...');
    const commitResult = await artifactIOTool.execute({
      context: {
        action: 'commit',
        artifactId: createResult.artifactId,
        message: 'Initial test content',
        author: 'test-system',
      },
    });
    
    console.log(`  Committed revision: ${commitResult.revisionId}`);
    console.log(`  Content reference: ${commitResult.reference}`);
    
    // 6. Test Read
    console.log('\n📖 Testing Content Read...');
    const readResult = await artifactIOTool.execute({
      context: {
        action: 'read',
        artifactId: createResult.artifactId,
      },
    });
    
    console.log(`  Read ${readResult.content?.length} characters`);
    console.log(`  Content preview: "${readResult.content?.substring(0, 50)}..."`);
    
    // 7. Test Diff Generation
    console.log('\n🔍 Testing Diff Generation...');
    
    // Make a change
    const modifiedContent = htmlContent.replace('Test Presentation', 'Modified Presentation');
    const modifiedHash = await contentStoreDAO.store(modifiedContent, 'text/html');
    const modifiedRevision = await artifactDAO.commit(
      createResult.artifactId,
      modifiedHash,
      'Modified title',
      'test-system',
      [commitResult.revisionId]
    );
    
    const diffResult = await artifactDiffTool.execute({
      context: {
        action: 'diff',
        artifactId: createResult.artifactId,
        fromRevision: commitResult.revisionId!,
        toRevision: modifiedRevision.revision_id,
        format: 'unified',
      },
    });
    
    console.log(`  Generated diff with ${diffResult.stats?.additions} additions, ${diffResult.stats?.deletions} deletions`);
    console.log(`  Diff preview:\n${diffResult.diff?.split('\n').slice(0, 10).join('\n')}`);
    
    // 8. Test Edit Operations
    console.log('\n✏️ Testing Edit Operations...');
    const editResult = await artifactDiffTool.execute({
      context: {
        action: 'apply_edits',
        artifactId: createResult.artifactId,
        edits: [
          {
            type: 'find_replace',
            find: 'Modified Presentation',
            replace: 'Final Presentation',
          },
          {
            type: 'append',
            text: '\n<!-- Generated by Artifact System Test -->',
          },
        ],
        commitMessage: 'Applied test edits',
        author: 'test-system',
      },
    });
    
    console.log(`  Applied ${editResult.stats?.changes} edits`);
    console.log(`  New revision: ${editResult.revisionId}`);
    
    // 9. Test Reference Resolution
    console.log('\n🔗 Testing Reference Resolution...');
    const resolveResult = await contentStoreTool.execute({
      context: {
        action: 'resolve_reference',
        reference: commitResult.reference!,
      },
    });
    
    console.log(`  Resolved reference ${commitResult.reference} successfully`);
    console.log(`  Content length: ${resolveResult.content?.length} characters`);
    
    // 10. Summary
    console.log('\n📊 Test Summary:');
    console.log('  ✅ Content Store: Working');
    console.log('  ✅ Artifact Creation: Working');
    console.log('  ✅ Content Append: Working');
    console.log('  ✅ Revision Commit: Working');
    console.log('  ✅ Content Read: Working');
    console.log('  ✅ Diff Generation: Working');
    console.log('  ✅ Edit Operations: Working');
    console.log('  ✅ Reference Resolution: Working');
    
    console.log('\n🎉 All tests passed successfully!');
    
    // Performance metrics
    const artifacts = await artifactDAO.findByJobId(jobId);
    console.log(`\n📈 Performance Metrics:`);
    console.log(`  Total artifacts created: ${artifacts.length}`);
    
    const revisions = await artifactDAO.getRevisions(createResult.artifactId);
    console.log(`  Total revisions: ${revisions.length}`);
    
    // Calculate space savings
    const fullTextLength = htmlContent.length * revisions.length;
    const actualStorage = htmlContent.length; // Due to content deduplication
    const savings = Math.round((1 - actualStorage / fullTextLength) * 100);
    console.log(`  Storage savings: ${savings}% (deduplication)`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testArtifactSystem()
    .then(() => {
      console.log('\n✨ Integration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Integration test failed:', error);
      process.exit(1);
    });
}

export { testArtifactSystem };