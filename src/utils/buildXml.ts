import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

/**
 * One XML element in preserveOrder mode: `{ ElementName: children[] }`, with
 * attributes under `:@`. Child arrays and attribute maps have well-defined
 * shapes; the element itself varies (text/comment/CDATA leaves included).
 */
interface Element {
  [tagName: string]: Element[] | Record<string, unknown> | string;
}
type Attrs = Record<string, unknown>;

const ELEMENT_ARRAY = <T = Element>(value: unknown): T[] | undefined =>
  Array.isArray(value) ? (value as T[]) : undefined;
const ATTRS = (value: unknown): Attrs => (value as Attrs) ?? {};

const options = {
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_',
  commentPropName: '#comment', cdataPropName: '#cdata', trimValues: false,
  parseTagValue: false, parseAttributeValue: false,
};

/** Keep elements, attributes, CDATA and comments distinct when editing saved XML. */
export class BuildXml {
  private document: Element[];
  private root: Element[];

  constructor(xml: string) {
    const valid = XMLValidator.validate(xml);
    if (valid !== true) throw new Error(`Invalid build XML: ${valid.err.msg}`);
    this.document = new XMLParser(options).parse(xml) as Element[];
    const root = this.document.find(node => node.PathOfBuilding)?.PathOfBuilding;
    if (!Array.isArray(root)) throw new Error('Missing PathOfBuilding element');
    this.root = root as Element[];
  }

  private static children(parent: Element | undefined, tag: string): Element[] | undefined {
    return ELEMENT_ARRAY(parent?.[tag]);
  }

  appendNotes(notes: string): void {
    let element = this.root.find(node => node.Notes);
    if (!element) { element = { Notes: [] }; this.root.push(element); }
    const children = BuildXml.children(element, 'Notes') ?? [];
    const separator = children.length ? '\n\n---\n\n' : '';
    children.push({ '#text': separator + notes });
  }

  /** The `<Spec>` element backing the active tree spec (1-based activeSpec attr). */
  private activeSpec(): { spec: Element; attrs: Attrs } {
    const tree = this.root.find(node => node.Tree);
    const specs = BuildXml.children(tree ?? {}, 'Tree')?.filter(node => node.Spec) ?? [];
    const index = Number(ATTRS(tree?.[':@'])['@_activeSpec'] ?? 1) - 1;
    const spec = specs[index];
    if (!spec) throw new Error('No active spec found in build');
    return { spec, attrs: (spec[':@'] as Attrs | undefined) ?? {} };
  }

  setTree(nodes: string[], masteryEffects?: Record<string, number>): string[] {
    const { spec, attrs } = this.activeSpec();
    const ids = nodes.map(String);
    if (ids.some(id => !/^\d+$/.test(id))) throw new Error('Invalid passive node ID');
    spec[':@'] = attrs;
    const oldNodes = String(attrs['@_nodes'] ?? '').split(',').filter(Boolean);
    attrs['@_nodes'] = ids.join(',');
    if (masteryEffects !== undefined) {
      const pairs = Object.entries(masteryEffects).map(([node, effect]) => {
        if (!/^\d+$/.test(node) || !ids.includes(node) || !Number.isSafeInteger(effect) || effect <= 0) {
          throw new Error(`Invalid mastery selection for node ${node}`);
        }
        return `{${node},${effect}}`;
      });
      attrs['@_masteryEffects'] = pairs.join(',');
      // Remove the obsolete, unreadable representation emitted by older server versions.
      spec.Spec = (BuildXml.children(spec, 'Spec') ?? []).filter(node => !node.MasteryEffect);
    }
    return oldNodes;
  }

  /** Node IDs allocated in the active spec (same spec setTree edits). */
  getAllocatedNodes(): string[] {
    const { attrs } = this.activeSpec();
    return String(attrs['@_nodes'] ?? '').split(',').filter(Boolean);
  }

  /** `<PlayerStat>` cached calc values PoB writes into the save file. */
  getPlayerStats(): Array<{ stat: string; value: string }> {
    const build = this.root.find(node => node.Build);
    return (BuildXml.children(build ?? {}, 'Build') ?? [])
      .filter(node => node.PlayerStat !== undefined)
      .map(stat => {
        const attrs = ATTRS(stat[':@']);
        return { stat: String(attrs['@_stat'] ?? ''), value: String(attrs['@_value'] ?? '') };
      });
  }

  toString(): string {
    return new XMLBuilder({ ...options, format: false }).build(this.document);
  }
}
