import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WatchService } from '../src/services/watchService';
import { BuildService } from '../src/services/buildService';

// Mock BuildService
jest.mock('../src/services/buildService');

describe('WatchService', () => {
  let watchService: WatchService;
  let mockBuildService: jest.Mocked<BuildService>;
  const testDirectory = '/test/pob/directory';

  beforeEach(() => {
    mockBuildService = new BuildService(testDirectory) as jest.Mocked<BuildService>;
    mockBuildService.invalidateBuild = jest.fn();
    watchService = new WatchService(testDirectory, mockBuildService);
  });

  afterEach(async () => {
    // Clean up any active watchers
    await watchService.stopWatching();
  });

  describe('constructor', () => {
    it('should initialize with directory and buildService', () => {
      expect(watchService.getDirectory()).toBe(testDirectory);
      expect(watchService.isWatchEnabled()).toBe(false);
    });
  });

  describe('getDirectory', () => {
    it('should return the PoB directory', () => {
      const result = watchService.getDirectory();
      expect(result).toBe(testDirectory);
    });
  });

  describe('isWatchEnabled', () => {
    it('should return false initially', () => {
      expect(watchService.isWatchEnabled()).toBe(false);
    });

    it('should return true after starting watch', () => {
      watchService.startWatching();
      expect(watchService.isWatchEnabled()).toBe(true);
    });

    it('should return false after stopping watch', async () => {
      watchService.startWatching();
      await watchService.stopWatching();
      expect(watchService.isWatchEnabled()).toBe(false);
    });
  });

  describe('getRecentChanges', () => {
    it('should return empty array initially', () => {
      const changes = watchService.getRecentChanges();
      expect(changes).toEqual([]);
    });

    it('should return changes in reverse chronological order', () => {
      // Manually add changes by accessing private property
      (watchService as any).recentChanges.push(
        { file: 'build1.xml', timestamp: 1000, type: 'added' },
        { file: 'build2.xml', timestamp: 2000, type: 'modified' },
        { file: 'build3.xml', timestamp: 3000, type: 'deleted' }
      );

      const changes = watchService.getRecentChanges();

      expect(changes).toHaveLength(3);
      expect(changes[0].file).toBe('build3.xml');
      expect(changes[1].file).toBe('build2.xml');
      expect(changes[2].file).toBe('build1.xml');
    });

    it('should respect limit parameter', () => {
      // Add 15 changes
      for (let i = 1; i <= 15; i++) {
        (watchService as any).recentChanges.push({
          file: `build${i}.xml`,
          timestamp: i * 1000,
          type: 'added'
        });
      }

      const changes = watchService.getRecentChanges(5);

      expect(changes).toHaveLength(5);
      expect(changes[0].file).toBe('build15.xml');
      expect(changes[4].file).toBe('build11.xml');
    });

    it('should default to 10 changes when no limit specified', () => {
      // Add 15 changes
      for (let i = 1; i <= 15; i++) {
        (watchService as any).recentChanges.push({
          file: `build${i}.xml`,
          timestamp: i * 1000,
          type: 'added'
        });
      }

      const changes = watchService.getRecentChanges();

      expect(changes).toHaveLength(10);
      expect(changes[0].file).toBe('build15.xml');
      expect(changes[9].file).toBe('build6.xml');
    });
  });

  describe('getRecentChangesCount', () => {
    it('should return 0 initially', () => {
      expect(watchService.getRecentChangesCount()).toBe(0);
    });

    it('should return correct count after adding changes', () => {
      (watchService as any).recentChanges.push(
        { file: 'build1.xml', timestamp: 1000, type: 'added' },
        { file: 'build2.xml', timestamp: 2000, type: 'modified' }
      );

      expect(watchService.getRecentChangesCount()).toBe(2);
    });
  });

  describe('processFileChange (via private method access)', () => {
    it('should invalidate build cache when file changes', () => {
      // Access private method
      (watchService as any).processFileChange('test.xml', 'modified');

      expect(mockBuildService.invalidateBuild).toHaveBeenCalledWith('test.xml');
    });

    it('should track file changes', () => {
      (watchService as any).processFileChange('test.xml', 'modified');

      const changes = watchService.getRecentChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].file).toBe('test.xml');
      expect(changes[0].type).toBe('modified');
    });

    it('should limit recent changes to 50', () => {
      // Add 60 changes
      for (let i = 1; i <= 60; i++) {
        (watchService as any).processFileChange(`build${i}.xml`, 'modified');
      }

      const count = watchService.getRecentChangesCount();
      expect(count).toBe(50);

      const changes = watchService.getRecentChanges(50);
      // Should have the most recent 50
      expect(changes[0].file).toBe('build60.xml');
      expect(changes[49].file).toBe('build11.xml');
    });
  });

  describe('handleFileChange (via private method access)', () => {
    it('should ignore non-XML files', () => {
      (watchService as any).handleFileChange('/path/to/file.txt', 'modified');

      // No changes should be tracked
      expect(watchService.getRecentChangesCount()).toBe(0);
      expect(mockBuildService.invalidateBuild).not.toHaveBeenCalled();
    });

    it('should process XML files', (done) => {
      (watchService as any).handleFileChange('/path/to/build.xml', 'modified');

      // Due to debouncing, wait for setTimeout
      setTimeout(() => {
        expect(watchService.getRecentChangesCount()).toBe(1);
        expect(mockBuildService.invalidateBuild).toHaveBeenCalledWith('build.xml');
        done();
      }, 600); // Wait longer than 500ms debounce
    });

    it('should debounce rapid changes to same file', (done) => {
      (watchService as any).handleFileChange('/path/to/build.xml', 'modified');
      (watchService as any).handleFileChange('/path/to/build.xml', 'modified');
      (watchService as any).handleFileChange('/path/to/build.xml', 'modified');

      setTimeout(() => {
        // Should only process once despite 3 calls
        expect(watchService.getRecentChangesCount()).toBe(1);
        expect(mockBuildService.invalidateBuild).toHaveBeenCalledTimes(1);
        done();
      }, 600);
    });
  });

  describe('startWatching and stopWatching', () => {
    it('should not start multiple watchers', () => {
      watchService.startWatching();
      const firstWatcher = (watchService as any).watcher;

      watchService.startWatching();
      const secondWatcher = (watchService as any).watcher;

      expect(firstWatcher).toBe(secondWatcher);
    });

    it('should handle stopWatching when not watching', async () => {
      // Should not throw
      await expect(watchService.stopWatching()).resolves.not.toThrow();
    });

    it('should clean up watcher on stop', async () => {
      watchService.startWatching();
      expect((watchService as any).watcher).not.toBeNull();

      await watchService.stopWatching();
      expect((watchService as any).watcher).toBeNull();
      expect(watchService.isWatchEnabled()).toBe(false);
    });
  });
});
