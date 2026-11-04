#!/usr/bin/env node
// Manual demo: crafting advisor output for a fixed input (no PoB required;
// the Lua bridge is optional and simply omitted from build context here).
// Requires `npm run build` first. Live currency rates come from poe.ninja and
// fall back to a labelled default when offline.
import { handleSuggestCrafting } from './build/handlers/craftingAdvisorHandler.js';
import { PoeNinjaClient } from './build/services/poeNinjaClient.js';

const ninjaClient = new PoeNinjaClient();

const context = {
  getLuaClient: () => null,
  ninjaClient,
};

const result = await handleSuggestCrafting(context, {
  slot: 'weapon',
  base: 'Opal Wand',
  desired_mods: [
    'cast speed T2+',
    'spell damage T2+',
  ],
  budget: 'medium',
  ilvl: 83,
  league: 'Standard',
});

console.log(result.content[0].text);
