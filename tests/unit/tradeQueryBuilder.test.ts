import { describe, expect, it } from '@jest/globals';
import { TradeQueryBuilder } from '../../src/services/tradeQueryBuilder';

describe('TradeQueryBuilder', () => {
  it('preserves the requested price currency in a Trade API price filter', () => {
    const query = new TradeQueryBuilder().withPriceRange(5, 20, 'divine').build();
    expect(query.query.filters?.trade_filters?.filters?.price).toEqual({ min: 5, max: 20, option: 'divine' });
  });

  it('passes price_currency through applyOptions', () => {
    const query = new TradeQueryBuilder().applyOptions({ league: 'Standard', maxPrice: 30, priceCurrency: 'exalted' }).build();
    expect(query.query.filters?.trade_filters?.filters?.price).toEqual({ min: undefined, max: 30, option: 'exalted' });
  });
});
