import { describe, it, expect } from '@jest/globals';
import { wrapHandler, wrapHandlerSync } from '../src/utils/errorHandling';

describe('errorHandling', () => {
  describe('wrapHandler', () => {
    it('should return the result of a successful handler', async () => {
      const result = await wrapHandler('test operation', async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should wrap Error instances with action context', async () => {
      await expect(
        wrapHandler('test operation', async () => {
          throw new Error('original error');
        })
      ).rejects.toThrow('Failed to test operation: original error');
    });

    it('should wrap non-Error throws with action context', async () => {
      await expect(
        wrapHandler('test operation', async () => {
          throw 'string error';
        })
      ).rejects.toThrow('Failed to test operation: string error');
    });

    it('should handle complex async operations', async () => {
      const result = await wrapHandler('fetch data', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { data: [1, 2, 3] };
      });

      expect(result).toEqual({ data: [1, 2, 3] });
    });
  });

  describe('wrapHandlerSync', () => {
    it('should return the result of a successful handler', () => {
      const result = wrapHandlerSync('test operation', () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should wrap Error instances with action context', () => {
      expect(() => {
        wrapHandlerSync('test operation', () => {
          throw new Error('original error');
        });
      }).toThrow('Failed to test operation: original error');
    });

    it('should wrap non-Error throws with action context', () => {
      expect(() => {
        wrapHandlerSync('test operation', () => {
          throw 'string error';
        });
      }).toThrow('Failed to test operation: string error');
    });

    it('should handle complex return types', () => {
      const result = wrapHandlerSync('parse data', () => {
        return { nested: { data: [1, 2, 3] } };
      });

      expect(result).toEqual({ nested: { data: [1, 2, 3] } });
    });
  });
});
