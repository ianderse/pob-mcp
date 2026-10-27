import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

type Node = Record<string, any>;
const options = {
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_',
  commentPropName: '#comment', cdataPropName: '#cdata', trimValues: false,
  parseTagValue: false, parseAttributeValue: false,
};

/** Keep elements, attributes, CDATA and comments distinct when editing saved XML. */
export class BuildXml {
  private document: Node[];
  private root: Node[];

  constructor(xml: string) {
    const valid = XMLValidator.validate(xml);
    if (valid !== true) throw new Error(`Invalid build XML: ${valid.err.msg}`);
    this.document = new XMLParser(options).parse(xml);
    this.root = this.document.find(node => node.PathOfBuilding)?.PathOfBuilding;
    if (!Array.isArray(this.root)) throw new Error('Missing PathOfBuilding element');
  }

  appendNotes(notes: string): void {
    let element = this.root.find(node => node.Notes);
    if (!element) { element = { Notes: [] }; this.root.push(element); }
    const separator = element.Notes.length ? '\n\n---\n\n' : '';
    element.Notes.push({ '#text': separator + notes });
  }

  setTree(nodes: string[], masteryEffects?: Record<string, number>): string[] {
    const tree = this.root.find(node => node.Tree);
    const specs = tree?.Tree.filter((node: Node) => node.Spec) ?? [];
    const index = Number(tree?.[':@']?.['@_activeSpec'] ?? 1) - 1;
    const spec = specs[index];
    if (!spec) throw new Error('No active spec found in build');
    const ids = nodes.map(String);
    if (ids.some(id => !/^\d+$/.test(id))) throw new Error('Invalid passive node ID');
    const attrs = spec[':@'] ??= {};
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
      spec.Spec = spec.Spec.filter((node: Node) => !node.MasteryEffect);
    }
    return oldNodes;
  }

  toString(): string {
    return new XMLBuilder({ ...options, format: false }).build(this.document);
  }
}
