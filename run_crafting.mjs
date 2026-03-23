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
