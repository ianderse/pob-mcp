import { describe, it, expect } from '@jest/globals';
import { BuildService } from '../../src/services/buildService';
import { BuildExportService } from '../../src/services/buildExportService';

describe('Path traversal protection', () => {
  const buildService = new BuildService('/tmp/pob-test-builds');

  it('should reject build names with path traversal in readBuild', async () => {
    await expect(buildService.readBuild('../../etc/passwd')).rejects.toThrow(/path traversal|outside base/i);
  });

  it('should reject absolute paths in build names', async () => {
    await expect(buildService.readBuild('/etc/passwd')).rejects.toThrow(/must be relative|absolute/i);
  });

  it('should reject null bytes in build names', async () => {
    await expect(buildService.readBuild('build\0.xml')).rejects.toThrow(/null bytes/i);
  });
});
