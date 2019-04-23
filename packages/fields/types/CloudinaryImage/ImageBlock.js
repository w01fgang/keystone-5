const pluralize = require('pluralize');
const { Block } = require('../../Block');

class ImageBlock extends Block {
  constructor({ adapter }, { type, fromList, createAuxList, getListByKey, listConfig }) {
    super();

    this.fromList = fromList;
    this.type = type;

    const auxListKey = `_Block_${fromList}_${this.type}`;

    // Ensure the list is only instantiated once per server instance.
    let auxList = getListByKey(auxListKey);

    if (!auxList) {
      auxList = createAuxList(auxListKey, {
        fields: {
          // We perform the requires here to avoid circular dependencies
          image: { type: require('./'), isRequired: true, adapter },
          align: { type: require('../Select'), defaultValue: 'center', options: ['left', 'center', 'right'] },
          // TODO: Inject the back reference to the item & field which created
          // this entry in the aux list
          //from: { type: require('../Relationship'), isRequired: true, ref: fromList },
          //field: { type: require('../Text'), isRequired: true },
        },
      });
    }

    this.auxList = auxList;

    // Require here to avoid circular dependencies
    const Relationship = require('../Relationship').implementation;

    // When content blocks are specified that have complex KS5 datatypes, the
    // client needs to send them along as graphQL inputs separate to the
    // `document`. Those inputs are relationships to our join tables.  Here we
    // create a Relationship field to leverage existing functionality for
    // generating the graphQL schema.
    this._inputFields = [
      new Relationship(this.path, { ref: auxListKey, many: true, withMeta: false }, listConfig),
    ];

    this._outputFields = [
      new Relationship(this.path, { ref: auxListKey, many: true, withMeta: false }, listConfig),
    ];
  }

  get path() {
    return pluralize.plural(this.type);
  }

  getGqlInputFields() {
    return this._inputFields;
  }

  getGqlOutputFields() {
    return this._outputFields;
  }

  async processMutations(input, {
    existingItem,
    context,
  }) {
    debugger;
    const mutationState = {
      afterChangeStack: [], // post-hook stack
      queues: {}, // backlink queues
      transaction: {}, // transaction
    };
    // TODO: Inject the back reference into `input` once we have the `from`
    // field setup on the aux list.
    const operations = await this._inputFields[0].resolveNestedOperations(input, existingItem, context, undefined, mutationState);

    debugger;
    return operations;
  }
}

module.exports = {
  ImageBlock,
};
