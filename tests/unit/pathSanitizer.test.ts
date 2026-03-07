import { describe, it, expect } from '@jest/globals';
import { sanitizeBuildName } from '../../src/utils/pathSanitizer';
import path from 'path';

describe('sanitizeBuildName', () => {
  const baseDir = '/home/user/.config/PathOfBuilding/Builds';

  it('should accept normal build names', () => {
    const result = sanitizeBuildName('build.xml', baseDir);
    expect(result).toBe(path.resolve(baseDir, 'build.xml'));
  });

  it('should accept subdirectory build names', () => {
    const result = sanitizeBuildName('league/starter.xml', baseDir);
    expect(result).toBe(path.resolve(baseDir, 'league', 'starter.xml'));
  });

  it('should reject path traversal with ../', () => {
    expect(() => sanitizeBuildName('../../etc/passwd', baseDir)).toThrow();
  });

  it('should reject absolute paths', () => {
    expect(() => sanitizeBuildName('/etc/passwd', baseDir)).toThrow();
  });

  it('should reject null bytes', () => {
    expect(() => sanitizeBuildName('foo\0bar', baseDir)).toThrow();
  });

  it('should reject Windows-style path traversal', () => {
    expect(() => sanitizeBuildName('..\\..\\windows\\system32', baseDir)).toThrow();
  });

  it('should reject encoded traversal that resolves outside baseDir', () => {
    expect(() => sanitizeBuildName('subdir/../../outside', baseDir)).toThrow();
  });

  it('should accept deeply nested valid paths', () => {
    const result = sanitizeBuildName('a/b/c/build.xml', baseDir);
    expect(result).toBe(path.resolve(baseDir, 'a', 'b', 'c', 'build.xml'));
  });
});
