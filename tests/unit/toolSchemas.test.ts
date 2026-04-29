import { describe, expect, it } from '@jest/globals';
import { getLuaToolSchemas, getToolSchemas } from '../../src/server/toolSchemas.js';

function namesOf(tools: Array<{ name: string }>): string[] {
  return tools.map((tool) => tool.name);
}

function schemaNamed(name: string) {
  const schema = [...getToolSchemas(), ...getLuaToolSchemas()].find((tool) => tool.name === name);
  if (!schema) throw new Error(`Missing schema: ${name}`);
  return schema;
}

describe('toolSchemas', () => {
  it('exposes lua_list_characters without requiring Lua bridge schemas', () => {
    const baseNames = namesOf(getToolSchemas());
    const luaNames = namesOf(getLuaToolSchemas());

    expect(baseNames).toContain('lua_list_characters');
    expect(luaNames).not.toContain('lua_list_characters');
  });

  it('allows lua_list_characters to use POE_ACCOUNT_NAME fallback', () => {
    const schema = schemaNamed('lua_list_characters');

    expect(schema.inputSchema.required || []).not.toContain('account_name');
    expect(schema.description).toContain('POE_ACCOUNT_NAME');
    expect(schema.inputSchema.properties.account_name.description).toContain('POE_ACCOUNT_NAME');
  });

  it('allows lua_import_character to use POE_ACCOUNT_NAME fallback', () => {
    const schema = schemaNamed('lua_import_character');

    expect(schema.inputSchema.required).toEqual(['character_name']);
    expect(schema.description).toContain('POE_ACCOUNT_NAME');
    expect(schema.inputSchema.properties.account_name.description).toContain('POE_ACCOUNT_NAME');
  });

  it('does not register duplicate tool names when Lua schemas are added', () => {
    const allNames = [...namesOf(getToolSchemas()), ...namesOf(getLuaToolSchemas())];
    const duplicateNames = allNames.filter((name, index) => allNames.indexOf(name) !== index);

    expect(duplicateNames).toEqual([]);
  });
});
