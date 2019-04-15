import path from 'path';
import { importView } from '@keystone-alpha/build-field-types';

import {
  CloudinaryImage,
  MongoCloudinaryImageInterface,
  KnexCloudinaryImageInterface,
} from './Implementation';
import { ImageBlock } from './ImageBlock';
import image from '../Content/blocks/image';
import caption from '../Content/blocks/caption';

export default {
  type: 'CloudinaryImage',
  implementation: CloudinaryImage,
  views: {
    Controller: importView('./views/Controller'),
    Field: importView('./views/Field'),
    Cell: importView('./views/Cell'),
  },
  adapters: {
    mongoose: MongoCloudinaryImageInterface,
    knex: KnexCloudinaryImageInterface,
  },
  blocks: {
    image: {
      type: 'cloudinaryImage',
      viewPath: path.join(__dirname, 'views/blocks/single-image'),
      implementation: ImageBlock,
      dependencies: [image, caption]
    },
    // gallery: {
    //   type: 'cloudinaryGallery',
    // },
  },
};
