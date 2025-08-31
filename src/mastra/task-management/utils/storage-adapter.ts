/**
 * Storage Adapter for Content-Addressable Storage
 * Provides abstraction layer for different storage backends (local, S3, R2, GCS)
 */

export interface StorageAdapter {
  store(key: string, content: Buffer): Promise<void>;
  retrieve(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string | null>;
}

/**
 * Local filesystem storage adapter
 */
export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;
  
  constructor(basePath: string = '.artifacts') {
    this.basePath = basePath;
    // Directory creation will be handled on first store operation
  }

  private async ensureDirectory(): Promise<void> {
    const fs = await import('fs');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }
  
  async store(key: string, content: Buffer): Promise<void> {
    await this.ensureDirectory();
    const fs = (await import('fs')).promises;
    const path = await import('path');
    const filePath = path.join(this.basePath, key);
    
    // Create subdirectories if needed (using first 2 chars of hash)
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(filePath, content);
  }
  
  async retrieve(key: string): Promise<Buffer | null> {
    const fs = (await import('fs')).promises;
    const path = await import('path');
    const filePath = path.join(this.basePath, key);
    
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if ((error as unknown as { code: string }).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
  
  async exists(key: string): Promise<boolean> {
    const fs = (await import('fs')).promises;
    const path = await import('path');
    const filePath = path.join(this.basePath, key);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  async delete(key: string): Promise<void> {
    const fs = (await import('fs')).promises;
    const path = await import('path');
    const filePath = path.join(this.basePath, key);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as unknown as { code: string }).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  
  async getUrl(key: string): Promise<string | null> {
    // For local storage, return file:// URL
    const path = await import('path');
    const filePath = path.join(this.basePath, key);
    return `file://${path.resolve(filePath)}`;
  }
}

/**
 * S3 storage adapter (placeholder for future implementation)
 */
export class S3StorageAdapter implements StorageAdapter {
  private bucket: string;
  private region: string;
  private client: unknown; // AWS SDK S3 client
  
  constructor(config: {
    bucket: string;
    region: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
  }) {
    this.bucket = config.bucket;
    this.region = config.region;
    
    // TODO: Initialize S3 client
    // this.client = new S3Client({
    //   region: config.region,
    //   credentials: config.accessKey && config.secretKey ? {
    //     accessKeyId: config.accessKey,
    //     secretAccessKey: config.secretKey,
    //   } : undefined,
    //   endpoint: config.endpoint,
    // });
  }
  
  async store(key: string, content: Buffer): Promise<void> {
    // TODO: Implement S3 upload
    void key;
    void content;
    throw new Error('S3 storage not yet implemented');
  }
  
  async retrieve(key: string): Promise<Buffer | null> {
    // TODO: Implement S3 download
    void key;
    throw new Error('S3 storage not yet implemented');
  }
  
  async exists(key: string): Promise<boolean> {
    // TODO: Implement S3 head object
    void key;
    throw new Error('S3 storage not yet implemented');
  }
  
  async delete(key: string): Promise<void> {
    // TODO: Implement S3 delete
    void key;
    throw new Error('S3 storage not yet implemented');
  }
  
  async getUrl(key: string): Promise<string | null> {
    // Return S3 URL or generate presigned URL
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}

/**
 * Storage factory
 */
export class StorageFactory {
  static create(type: string = 'local', config?: unknown): StorageAdapter {
    switch (type) {
      case 'local':
        const localConfig = config as { basePath?: string } | undefined;
        return new LocalStorageAdapter(localConfig?.basePath);
      
      case 's3':
        if (!config) {
          throw new Error('S3 configuration required');
        }
        const s3Config = config as { 
          bucket?: string; 
          region?: string; 
          accessKey?: string; 
          secretKey?: string; 
          endpoint?: string; 
        };
        return new S3StorageAdapter({
          bucket: s3Config.bucket || process.env.ARTIFACT_S3_BUCKET!,
          region: s3Config.region || process.env.ARTIFACT_S3_REGION || 'us-east-1',
          accessKey: s3Config.accessKey || process.env.ARTIFACT_S3_ACCESS_KEY,
          secretKey: s3Config.secretKey || process.env.ARTIFACT_S3_SECRET_KEY,
          endpoint: s3Config.endpoint || process.env.ARTIFACT_S3_ENDPOINT,
        });
      
      // Future: Add R2, GCS adapters
      
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }
  }
  
  static getDefault(): StorageAdapter {
    const type = process.env.ARTIFACT_STORAGE_TYPE || 'local';
    return StorageFactory.create(type);
  }
}

// Export singleton instance
export const defaultStorage = StorageFactory.getDefault();