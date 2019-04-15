import { Block } from 'slate';

export function walkSlateDocument(node, { visitBlock }) {
  if (node.object === 'value' && node.document) {
    return {
      ...node,
      document: walkSlateDocument(node.document, { visitBlock }),
    };
  } else if (
    node.object == 'document' ||
    (node.object == 'block' && Block.isBlockList(node.nodes))
  ) {
    return {
      ...node,
      nodes: node.nodes.map(childNode => walkSlateDocument(childNode, { visitBlock })),
    };
  } else {
    const { node: newNode, isFinal = false } = visitBlock(node);

    if (!isFinal && node.nodes) {
      return {
        ...newNode,
        nodes: node.nodes.map(childNode => walkSlateDocument(childNode, { visitBlock })),
      }
    }

    return newNode;
  }
}
