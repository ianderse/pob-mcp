import { describe, it, expect } from '@jest/globals';
import { parseArgs, resolveLuaCommand } from '../../src/utils/luaCommand.js';

const DEFAULT = ['/repo/lua/vanilla_stdio_bridge.lua'];

describe('parseArgs', () => {
  it('keeps whitespace splitting for plain values', () => {
    expect(parseArgs('a.lua  --flag')).toEqual(['a.lua', '--flag']);
  });

  // The motivating case: Windows paths with spaces were split into pieces.
  it('accepts a JSON array so paths with spaces survive', () => {
    expect(parseArgs('["C:\\\\My Scripts\\\\bridge.lua", "x"]')).toEqual(['C:\\My Scripts\\bridge.lua', 'x']);
  });

  it('treats unset or blank as no override', () => {
    expect(parseArgs(undefined)).toBeUndefined();
    expect(parseArgs('   ')).toBeUndefined();
  });

  it('rejects malformed JSON and non-string arrays instead of guessing', () => {
    expect(() => parseArgs('[oops')).toThrow(/does not parse/);
    expect(() => parseArgs('[1, 2]')).toThrow(/array of strings/);
  });
});

describe('resolveLuaCommand', () => {
  it('defaults to luajit with the repo adapter', () => {
    expect(resolveLuaCommand({}, DEFAULT)).toEqual({ cmd: 'luajit', args: DEFAULT });
  });

  it('runs a .py shim through Python, script first', () => {
    expect(resolveLuaCommand({ POB_CMD: 'C:\\x\\luajit_shim.py' }, DEFAULT, 'win32'))
      .toEqual({ cmd: 'python', args: ['C:\\x\\luajit_shim.py', ...DEFAULT] });
    expect(resolveLuaCommand({ POB_CMD: '/x/luajit_shim.py' }, DEFAULT, 'linux').cmd).toBe('python3');
    expect(resolveLuaCommand({ POB_CMD: 's.PY', POB_PYTHON: 'C:\\py\\python.exe' }, DEFAULT, 'win32').cmd)
      .toBe('C:\\py\\python.exe');
  });

  it('applies POB_ARGS after the shim', () => {
    expect(resolveLuaCommand({ POB_CMD: 's.py', POB_ARGS: '["b c.lua"]' }, DEFAULT, 'win32'))
      .toEqual({ cmd: 'python', args: ['s.py', 'b c.lua'] });
  });
});
