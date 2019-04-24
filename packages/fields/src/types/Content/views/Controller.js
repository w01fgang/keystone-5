// TODO: This is a bit of a mess, and won't work when we split Content
// out into its own package. But the build process doesn't understand
// how to traverse preconstruct's src pointers yet, when it does this
// should import from '@keystone-alpha/fields/types/Text/views/Controller'
import memoizeOne from 'memoize-one';
import isPromise from 'p-is-promise';
import { omitBy } from '@keystone-alpha/utils';
import { Value } from 'slate';
import TextController from '../../Text/views/Controller';
import { serialiseSlateValue } from '../serialiser';
import { initialValue } from './editor/constants';

const flattenBlocks = inputBlocks =>
  inputBlocks.reduce((outputBlocks, block) => {
    // NOTE: It's enough to check just the type here as we've already flattened
    // and deduped dependencies during build.
    if (outputBlocks[block.type]) {
      throw new Error(
        `Encountered more than one Content block with type of '${
          block.type
        }'. Content blocks must have globally unique types.`
      );
    }

    if (block.Node === undefined) {
      throw new Error(`Unable to load Content block '${block.type}': no 'Node' export found.`);
    }

    outputBlocks[block.type] = block;

    return outputBlocks;
  }, {});

export default class ContentController extends TextController {
  constructor(...args) {
    super(...args);

    // Attach this as a memoized member function to avoid two pitfalls;
    // 1. Don't load all the block views up front. Instead, lazily load them
    //    only when requested.
    // 2. Avoid recalculating everything on each request for the Blocks.
    //    Instead, when requested multiple times, use the previously cached
    //    results.
    // NOTE: This function is designed to work with React Suspense, so may throw
    // a Promise the first time it is called.
    this.getBlocks = memoizeOne(() => {
      // Loads all configured blocks and their dependencies
      const blocksModules = this.adminMeta.readViews(this.views.blocks);

      const customBlocks = blocksModules.map(block => ({
        ...block,
        options: this.config.blockOptions[block.type],
        // This block exists because it was passed into the Content field
        // directly.
        // Depdencies are not allowed to show UI chrome (toolbar/sidebar) unless
        // they're also directly passed to the Content Field.
        withChrome: this.config.blockTypes.includes(block.type),
      }));

      return flattenBlocks(customBlocks);
    });

    this.getBlocksNoZalgo = memoizeOne(async () => {
      // To support React Suspense, .getBlocks() might throw a promise.
      // .getValue() should only be called during an event handler, not a render,
      // so we need to catch the thrown promise and handle the async nature of it
      // correctly.
      // Ie; we're containing the Zalgo.
      let blocks;
      while(!blocks) {
        try {
          // May return synchronously, or may throw with either an actual error or
          // a loading promise.
          // For the returns-synchronously case, we want to ensure this function
          // always returns a promise, so we add the `await` here. Otherwise,
          // this function may unexpectedly return a value which isn't a Promise.
          blocks = await this.getBlocks();
        } catch (loadingPromiseOrError) {
          if (!isPromise(loadingPromiseOrError)) {
            // An actual error occured
            throw loadingPromiseOrError;
          }

          // Wait for the loading promise to resolve
          // The while-loop will take another turn, and we'll hopefully get a
          // synchronous return value this time.
          await loadingPromiseOrError;
        }
      }

      return blocks;
    });
  }

  serialize = data => {
    const { path } = this.config;
    if (!data[path] || !data[path].document) {
      // Forcibly return null if empty string
      return { document: null };
    }

    let blocks;
    // May return synchronously, or may throw with either an actual error or a
    // loading promise. We should never see a Promise thrown as .serialize()
    // only gets called during event handlers on the client _after_ all the
    // React Suspense calls are fully resolved. We want the
    // returns-synchronously case. Otherwise, we want to either rethrow any
    // error thrown, or throw a new error indicating an unexpected Promise was
    // thrown.
    try {
      blocks = this.getBlocks();
    } catch (loadingPromiseOrError) {
      if (isPromise(loadingPromiseOrError)) {
        // `.getBlocks()` thinks it's in React Suspense mode, which we can't
        // handle here, so we throw a new error.
        throw new Error('`Content#getBlocks()` threw a Promise. This may occur when calling `Content#serialize()` before blocks have had a chance to fully load.');
      }

      // An actual error occured
      throw loadingPromiseOrError;
    }

    const serialisedDocument = serialiseSlateValue(
      data[path],
      omitBy(blocks, type => !blocks[type].serialize),
    );

    // TODO: Make this a JSON type in GraphQL so we don't have to stringify it.
    serialisedDocument.document = JSON.stringify(serialisedDocument.document);

    debugger;
    return serialisedDocument;
  };

  deserialize = data => {
    debugger;
    let value;
    if (data[this.config.path] && data[this.config.path].document) {
      value = {
        document: JSON.parse(data[this.config.path].document),
      };
    } else {
      value = initialValue;
    }
    return Value.fromJSON(value);
  };

  getQueryFragment = () => {
    return `
      ${this.path} {
        document
      }
    `;
  };
}
