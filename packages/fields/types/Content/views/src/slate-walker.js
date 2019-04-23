import { Node } from 'slate';

// Convert a Node to JSON without the .nodes list, which avoids recursively
// calling .toJSON() on all child nodes.
function shallowNodeToJson(node) {
  const nodes = node.nodes;
  node.nodes = Node.createList();
  const json = node.toJSON();
  node.nodes = nodes;
  return json;
}

// A depth-first, top-down tree walking algorithm.
function visitNode(node, serlializers) {
  let serializedNode = null;

  // Registered serialisers might serialise a node.
  // If they do, it's their responsibility to also serialise all the child nodes
  switch(node.object) {
    case 'document': {
      serializedNode = serlializers.serializeDocument(node);
      break;
    }
    case 'block': {
      serializedNode = serlializers.serializeBlock(node);
      break;
    }
    case 'inline': {
      serializedNode = serlializers.serializeInline(node);
      break;
    }
    case 'text': {
      serializedNode = serlializers.serializeText(node);
      break;
    }
    default: {
      serializedNode = node.toJSON();
      break;
    }
  }

  // The node (and children) wasn't serialised, so we'll use the default JSON
  // for this node, and recurse onto the child nodes.
  if (!serializedNode) {
    // Serialize this node first
    serializedNode = shallowNodeToJson(node);

    if (node.nodes) {
      // Now we recurse into the child nodes array
      serializedNode.nodes = node.nodes.map(childNode => visitNode(childNode, serlializers));
    }
  }

  return serializedNode;
}

const noop = () => {};

export function serializeSlateNode(
  node,
  // Serializers should return a JSON representation of the node and its
  // children, or return nothing to continue walking the tree.
  {
    serializeDocument = noop,
    serializeBlock = noop,
    serializeInline = noop,
    serializeText = noop,
  }
) {
  return visitNode(
    node,
    {
      serializeDocument,
      serializeBlock,
      serializeInline,
      serializeText,
    }
  );
}
