import { describe, it, expect } from '@jest/globals';
import { sanitizeBuildName, buildFileName, resolveBuildFile } from '../../src/utils/pathSanitizer';
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

describe('buildFileName', () => {
  it('should append .xml only when absent, whatever the case', () => {
    expect(buildFileName('Mine')).toBe('Mine.xml');
    expect(buildFileName('Mine.xml')).toBe('Mine.xml');
    expect(buildFileName('Mine.XML')).toBe('Mine.XML');
  });

  it('should not mistake a dot in the name for a suffix', () => {
    expect(buildFileName('v2.1 boss farmer')).toBe('v2.1 boss farmer.xml');
  });
});

describe('resolveBuildFile', () => {
  const baseDir = '/home/user/.config/PathOfBuilding/Builds';

  it('should append the suffix to the final segment of a subdirectory build', () => {
    expect(resolveBuildFile('league/starter', baseDir)).toBe(
      path.resolve(baseDir, 'league', 'starter.xml')
    );
  });

  // Appending the suffix must not open a hole in the traversal checks
  it('should still reject traversal, absolute paths and null bytes', () => {
    expect(() => resolveBuildFile('../../etc/passwd', baseDir)).toThrow();
    expect(() => resolveBuildFile('/etc/passwd', baseDir)).toThrow();
    expect(() => resolveBuildFile('foo\0bar', baseDir)).toThrow();
    expect(() => resolveBuildFile('..\\..\\windows\\system32', baseDir)).toThrow();
  });
});
