import { describe, it, expect } from '@jest/globals';
import { handleCalculateTradingProfit } from '../../src/handlers/poeNinjaHandlers.js';


describe('handleCalculateTradingProfit incomplete chains', () => {
  const textOf = (r: { content: Array<{ text?: string }> }) => r.content.map((c) => c.text ?? '').join('');

  it('does not print a final Result or profit verdict when a mid-chain currency is missing', async () => {
    const context = {
      ninjaClient: {
        getCurrencyExchangeMap: async () => new Map([['Chaos Orb', 1], ['Exalted Orb', 10]]),
      },
    };
    const result = await handleCalculateTradingProfit(context as never, {
      league: 'Settled',
      currency_chain: ['Chaos Orb', 'Exalted Orb', 'Divine Orb', 'Chaos Orb'],
      start_amount: 100,
    });
    const text = textOf(result);
    expect(text).toContain('not found in rate data');
    expect(text).toContain('Chain incomplete');
    expect(text).not.toContain('Result:');
    expect(text).not.toContain('Profit Analysis');
  });
});
