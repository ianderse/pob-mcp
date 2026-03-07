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

  it('should not have dead code nodeOptimizer.ts', () => {
    const fsSync = require('fs');
    const pathMod = require('path');
    const nodeOptimizerPath = pathMod.join(__dirname, '../../src/nodeOptimizer.ts');
    expect(fsSync.existsSync(nodeOptimizerPath)).toBe(false);
  });

  it('should have sanitizeBuildName in all handler files that use path.join with buildName', () => {
    const fsSync = require('fs');
    const pathMod = require('path');
    const srcDir = pathMod.join(__dirname, '../../src');

    const filesToCheck = [
      'services/buildExportService.ts',
      'handlers/luaHandlers.ts',
      'handlers/buildHandlers.ts',
      'handlers/optimizationHandlers.ts',
      'handlers/validationHandlers.ts',
      'handlers/advancedOptimizationHandlers.ts',
    ];

    for (const file of filesToCheck) {
      const source = fsSync.readFileSync(pathMod.join(srcDir, file), 'utf-8');
      // Files that use path.join with user-supplied buildName must import sanitizeBuildName
      if (source.includes('path.join') && source.includes('buildName')) {
        expect({ file, hasSanitize: source.includes('sanitizeBuildName') })
          .toEqual({ file, hasSanitize: true });
      }
    }
  });
});
