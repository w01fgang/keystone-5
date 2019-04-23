import { mapKeys } from '@keystone-alpha/utils';
import diff from 'jest-diff';
import { Range } from 'slate'
import mergeWith from 'lodash.mergewith';

import { serializeSlateNode } from './slate-walker';

const CREATE = 'create';
const CONNECT = 'connect';

/**
 * @param document Object For example:
 * [
 *   { object: 'block', type: 'cloudinaryImage', data: { file: <FileObject>, align: 'center' } },
 *   { object: 'block', type: 'cloudinaryImage', data: { file: <FileObject>, align: 'center' } },
 *   { object: 'block', type: 'relationshipTag', data: { name: 'foobar' } }
 *   { object: 'block', type: 'relationshipUser', data: { _joinId: 'xyz789', id: 'uoi678' } }
 * ]
 *
 * @return Object For example:
 * {
 *   document: [
 *     { object: 'block', type: 'cloudinaryImage', data: { _mutationPath: 'cloudinaryImages.create[0]' } },
 *     { object: 'block', type: 'cloudinaryImage', data: { _mutationPath: 'cloudinaryImages.create[1]' } },
 *     { object: 'block', type: 'relationshipTag', data: { _mutationPath: 'relationshipTags.create[0]' } }
 *     { object: 'block', type: 'relationshipUser', data: { _mutationPath: 'relationshipUsers.connect[0]' } }
 *   ],
 *   cloudinaryImages: {
 *     create: [
 *       { image: <FileObject>, align: 'center' },
 *       { image: <FileObject>, align: 'center' },
 *     ]
 *   },
 *   relationshipTags: {
 *     create: [{ tag: { create: { name: 'foobar' } } }],
 *   },
 *   relationshipUsers: {
 *     connect: [{ id: 'xyz789' }],
 *   },
 * }
 */
export function serialiseSlateValue(document, blocks) {
  const allMutations = Object.values(blocks).reduce(
    (memo, block) => ({
      ...memo,
      [block.path]: {}
    }),
    {}
  );

  let serializedDocument;

  try {
    // Force into read only mode so blocks don't accidentally modify any data
    editor.setReadOnly(true);

    serializedDocument = serializeSlateNode(
      editor.document,
      {
        serializeBlock(node) {
          const block = blocks[node.type];

          // No matching block that we're in charge of
          if (!block) {
            return;
          }

          const { mutations, node: serializedNode } = block.serialize({ editor, node });

          if (mutations && Object.keys(mutations).length) {
            // Ensure the mutation group exists
            allMutations[block.path] = allMutations[block.path] || {
              // TODO: Don't forcible disconnect & reconnect. (It works because we know
              // the entire document, so all creations & connections exist below).
              // Really, we should do a diff and only perform the things that have
              // actually changed. Although, this may be quite complex.
              disconnectAll: true,
            };

            // It's possible the serialization returned mutations but didn't
            // handle the actual serialisation of the node itself, instead
            // leaving it to recurse further.
            if (serializedNode) {
              // Ensure there's a .data._mutationPaths array
              serializedNode.data = serializedNode.data || {};
              serializedNode.data._mutationPaths = serializedNode.data._mutationPaths || [];
            } else {
              if (!node.data.has('_mutationPaths')) {
                node.data.set('_mutationPaths', []);
              }
            }

            // Gather up all the mutations, keyed by the block's path & the
            // "action" returned by the serialize call.
            Object.entries(mutations, ([action, mutation]) => {
              allMutations[block.path][action] = allMutations[block.path][action] || [];
              const insertedBefore = allMutations[block.path][action].push(mutation);
              const mutationPath = `${block.path}.${action}[${insertedBefore - 1}]`;
              if (serializedNode) {
                serializedNode.data._mutationPaths.push(mutationPath);
              } else {
                node.data.get('_mutationPaths').push(mutationPath);
              }
            });
          }

          return node;
        },
      },
    );
  } finally {
    // Reset back to what things were before we walked the tree
    editor.setReadOnly(isReadOnly);
  }

  return {
    document: serializedDocument,
    ...allMutations,
  };
}

/**
 * @param document Object For example:
 * {
 *   document: [
 *     { object: 'block', type: 'cloudinaryImage', data: { _joinId: 'abc123' } },
 *     { object: 'block', type: 'cloudinaryImage', data: { _joinId: 'qwe345' } },
 *     { object: 'block', type: 'relationshipUser', data: { _joinId: 'ert567' } }
 *     { object: 'block', type: 'relationshipUser', data: { _joinId: 'xyz890' } }
 *   ],
 *   cloudinaryImages: [
 *     { id: 'abc123', publicUrl: '...', align: 'center' },
 *     { id: 'qwe345', publicUrl: '...', align: 'center' },
 *   ],
 *   relationshipUsers: [
 *     { id: 'ert567', user: { id: 'dfg789' } },
 *     { id: 'xyz890', user: { id: 'uoi678' } },
 *   ],
 * }
 *
 * @return Object For example:
 * [
 *   { object: 'block', type: 'cloudinaryImage', data: { _joinId: 'abc123', publicUrl: '...', align: 'center' } },
 *   { object: 'block', type: 'cloudinaryImage', data: { _joinId: 'qwe345', publicUrl: '...', align: 'center' } },
 *   { object: 'block', type: 'relationshipUser', data: { _joinId: 'ert567', user: { id: 'dfg789' } } }
 *   { object: 'block', type: 'relationshipUser', data: { _joinId: 'xyz789', user: { id: 'uoi678' } } }
 * ]
 */
export function deserialiseSlateDocument({ document, ...serialisations }, blocks) {
  return serializeSlateNode(
    document,
    {
      serializeBlock(node) {
        // All our blocks need a _joinId, so we can early-out for any that don't
        if (!node.data || !node.data._joinId) {
          return node;
        }

        const block = blocks[node.type];

        if (!block || !Array.isArray(serialisations[block.path])) {
          return node;
        }

        const data = serialisations[block.path].find(({ id }) => id === node.data._joinId);

        if (!data) {
          throw new Error(`Unable to find data for ${block.path}.${node.data._joinId}`);
        }

        return {
          ...node,
          data: {
            ...node.data,
            ...data,
          },
        };
      },
    },
  );
}
