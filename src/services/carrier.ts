/**
 * The equipped item a hypothetical modifier is appended to. PoB has no API for
 * injecting a bare modifier, so probes substitute a modified copy of a real item
 * for one calculation.
 */
export interface CarrierItem {
  slot: string;
  raw: string;
}

/**
 * Slots whose item can carry an extra modifier. Rings first: they are the
 * least likely to be the build's damage source, so substituting one disturbs least.
 */
export const CARRIER_SLOTS: readonly string[] = [
  'Ring 2', 'Ring 1', 'Amulet', 'Belt', 'Gloves', 'Boots', 'Helmet', 'Body Armour',
];

/** The item to carry a probe: the named slot if given, else the first carrier slot that is filled. */
export function pickCarrier(items: any[], slot?: string): CarrierItem | undefined {
  const slots = slot ? [slot] : CARRIER_SLOTS;
  for (const name of slots) {
    const found = items.find((item) => item?.slot === name && typeof item?.raw === 'string');
    if (found) return { slot: name, raw: found.raw };
  }
  return undefined;
}
