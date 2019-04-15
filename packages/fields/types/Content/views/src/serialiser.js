import { mapKeys } from '@keystone-alpha/utils';

import { walkSlateDocument } from './slate-walker';

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
export function serialiseSlateDocument(document, blocks) {
  const mutations = Object.values(blocks).reduce(
    (memo, block) => ({
      ...memo,
      [block.path]: {}
    }),
    {}
  );

  const mutatedDocument = walkSlateDocument(
    document,
    {
      visitBlock(node) {
        const block = blocks[node.type];

        if (!block) {
          return node;
        }

        let processedNode;
        let action;

        if (node.data._joinId) {
          // An existing connection
          action = CONNECT;
          processedNode = block.processNodeForConnectQuery({ id: node.data._joinId, node });
        } else {
          // Create a new related complex data type
          action = CREATE;
          processedNode = block.processNodeForCreateQuery({ node });
        }

        if (!processedNode.query) {
          return {
            node: processedNode.node,
            isFinal: true,
          };
        }

        mutations[block.path][action] = mutations[block.path][action] || [];
        mutations[block.path][action].push(processedNode.query);

        const insertedAt = mutations[block.path][action].length - 1;

        debugger;

        return {
          node: {
            ...processedNode.node,
            data: {
              ...processedNode.node.data,
              _mutationPath: `${block.path}.${action}[${insertedAt}]`,
            },
          },
          // In the future, we'll want to allow nested blocks to be handled too.
          // For now, we just stop at the outter most block.
          isFinal: true,
        };
      },
    },
  );

  return {
    document: mutatedDocument,
    ...mapKeys(mutations, ({ create, connect }) => ({
      // TODO: Don't forcible disconnect & reconnect. (It works because we know
      // the entire document, so all creations & connections exist below).
      // Really, we should do a diff and only perform the things that have
      // actually changed. Although, this may be quite complex.
      disconnectAll: true,
      create,
      connect,
    })),
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
  return walkSlateDocument(
    document,
    {
      visitBlock(node) {
        // All our blocks need a _joinId, so we can early-out for any that don't
        if (!node.data || !node.data._joinId) {
          return node;
        }

        const block = blocks[node.type]

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
