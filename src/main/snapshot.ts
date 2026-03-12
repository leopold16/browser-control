import { WebContents } from 'electron';
import { cdpSend } from './cdp';

// Per-tab ref → backendDOMNodeId mapping
const refMaps = new WeakMap<WebContents, Map<number, number>>();

export function getRefMap(webContents: WebContents): Map<number, number> {
  return refMaps.get(webContents) || new Map();
}

interface AXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  role?: { value: string };
  name?: { value: string };
  description?: { value: string };
  value?: { value: string };
  properties?: Array<{ name: string; value: { value: any } }>;
  childIds?: string[];
  ignored?: boolean;
}

export interface SnapshotNode {
  ref: number;
  role: string;
  name: string;
  value?: string;
  description?: string;
  placeholder?: string;
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  children?: SnapshotNode[];
}

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'textarea',
]);

const CONTENT_ROLES = new Set([
  'heading',
  'paragraph',
  'listitem',
  'cell',
  'row',
  'columnheader',
  'rowheader',
  'img',
  'figure',
  'blockquote',
  'code',
  'status',
  'alert',
  'dialog',
  'navigation',
  'main',
  'complementary',
  'contentinfo',
  'banner',
  'form',
  'region',
  'list',
  'table',
  'tree',
  'treeitem',
  'group',
  'toolbar',
  'menu',
  'menubar',
  'tablist',
  'tabpanel',
  'separator',
  'article',
  'section',
]);

function getProp(node: AXNode, name: string): any {
  const prop = node.properties?.find((p) => p.name === name);
  return prop?.value?.value;
}

export async function getSnapshot(
  webContents: WebContents,
  full: boolean = false
): Promise<{ url: string; title: string; tree: SnapshotNode[] }> {
  const result = await cdpSend(webContents, 'Accessibility.getFullAXTree');
  const nodes: AXNode[] = result.nodes;

  // Build nodeId → AXNode map
  const nodeMap = new Map<string, AXNode>();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const refMap = new Map<number, number>();
  let nextRef = 1;

  if (full) {
    // Full tree mode: DFS traversal, assign refs, nested structure
    const tree = buildTree(nodes, nodeMap, refMap, () => nextRef++);
    refMaps.set(webContents, refMap);
    return {
      url: webContents.getURL(),
      title: webContents.getTitle(),
      tree,
    };
  }

  // Flat mode: only interactive elements
  const flatNodes: SnapshotNode[] = [];
  for (const node of nodes) {
    if (node.ignored) continue;
    const role = node.role?.value || '';
    if (!INTERACTIVE_ROLES.has(role)) continue;

    const name = node.name?.value || '';
    // Skip unnamed non-textual elements
    if (!name && role !== 'textbox' && role !== 'combobox' && role !== 'searchbox' && role !== 'textarea') continue;

    const ref = nextRef++;
    if (node.backendDOMNodeId) {
      refMap.set(ref, node.backendDOMNodeId);
    }

    const entry: SnapshotNode = { ref, role, name };

    const value = node.value?.value;
    if (value !== undefined && value !== '') {
      entry.value = String(value);
    }

    const description = node.description?.value || getProp(node, 'description');
    if (description) entry.description = String(description);

    const placeholder = getProp(node, 'placeholder');
    if (placeholder) entry.placeholder = String(placeholder);

    const checked = getProp(node, 'checked');
    if (checked !== undefined) entry.checked = checked === 'true' || checked === true;

    const selected = getProp(node, 'selected');
    if (selected !== undefined) entry.selected = selected === true;

    const disabled = getProp(node, 'disabled');
    if (disabled !== undefined) entry.disabled = disabled === true;

    const readonly = getProp(node, 'readonly');
    if (readonly !== undefined) entry.readonly = readonly === true || readonly === 'true';

    flatNodes.push(entry);
  }

  refMaps.set(webContents, refMap);
  return {
    url: webContents.getURL(),
    title: webContents.getTitle(),
    tree: flatNodes,
  };
}

function buildTree(
  nodes: AXNode[],
  nodeMap: Map<string, AXNode>,
  refMap: Map<number, number>,
  getRef: () => number
): SnapshotNode[] {
  if (nodes.length === 0) return [];

  const root = nodes[0];
  const result = buildSubtree(root, nodeMap, refMap, getRef);
  return result ? [result] : [];
}

function buildSubtree(
  node: AXNode,
  nodeMap: Map<string, AXNode>,
  refMap: Map<number, number>,
  getRef: () => number
): SnapshotNode | null {
  if (node.ignored && !node.childIds?.length) return null;

  const role = node.role?.value || 'none';
  const name = node.name?.value || '';

  // Skip purely structural/ignored nodes without meaningful content
  if (role === 'none' || role === 'generic' || role === 'InlineTextBox' || role === 'LineBreak') {
    // But still recurse children
    if (node.childIds?.length) {
      const children: SnapshotNode[] = [];
      for (const childId of node.childIds) {
        const child = nodeMap.get(childId);
        if (child) {
          const sub = buildSubtree(child, nodeMap, refMap, getRef);
          if (sub) children.push(sub);
        }
      }
      if (children.length === 1) return children[0];
      if (children.length > 1) {
        const ref = getRef();
        if (node.backendDOMNodeId) refMap.set(ref, node.backendDOMNodeId);
        return { ref, role: 'group', name: '', children };
      }
    }
    return null;
  }

  const isInteractive = INTERACTIVE_ROLES.has(role);
  const isContent = CONTENT_ROLES.has(role);

  // Skip if not meaningful
  if (!isInteractive && !isContent && !name && !node.childIds?.length) return null;

  const ref = getRef();
  if (node.backendDOMNodeId) {
    refMap.set(ref, node.backendDOMNodeId);
  }

  const entry: SnapshotNode = { ref, role, name };

  const value = node.value?.value;
  if (value !== undefined && value !== '') entry.value = String(value);

  const description = node.description?.value || getProp(node, 'description');
  if (description) entry.description = String(description);

  const placeholder = getProp(node, 'placeholder');
  if (placeholder) entry.placeholder = String(placeholder);

  const checked = getProp(node, 'checked');
  if (checked !== undefined) entry.checked = checked === 'true' || checked === true;

  const selected = getProp(node, 'selected');
  if (selected !== undefined) entry.selected = selected === true;

  const disabled = getProp(node, 'disabled');
  if (disabled !== undefined) entry.disabled = disabled === true;

  const readonly = getProp(node, 'readonly');
  if (readonly !== undefined) entry.readonly = readonly === true || readonly === 'true';

  // Recurse children
  if (node.childIds?.length) {
    const children: SnapshotNode[] = [];
    for (const childId of node.childIds) {
      const child = nodeMap.get(childId);
      if (child) {
        const sub = buildSubtree(child, nodeMap, refMap, getRef);
        if (sub) children.push(sub);
      }
    }
    if (children.length > 0) entry.children = children;
  }

  return entry;
}
