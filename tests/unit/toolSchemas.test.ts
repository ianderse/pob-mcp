import { describe, expect, it } from '@jest/globals';
import { getLuaToolSchemas, getToolSchemas } from '../../src/server/toolSchemas.js';

function namesOf(tools: Array<{ name: string }>): string[] {
  return tools.map((tool) => tool.name);
}

describe('toolSchemas', () => {
  it('exposes lua_list_characters without requiring Lua bridge schemas', () => {
    const baseNames = namesOf(getToolSchemas());
    const luaNames = namesOf(getLuaToolSchemas());

    expect(baseNames).toContain('lua_list_characters');
    expect(luaNames).not.toContain('lua_list_characters');
  });

  it('does not register duplicate tool names when Lua schemas are added', () => {
    const allNames = [...namesOf(getToolSchemas()), ...namesOf(getLuaToolSchemas())];
    const duplicateNames = allNames.filter((name, index) => allNames.indexOf(name) !== index);

    expect(duplicateNames).toEqual([]);
  });
});
