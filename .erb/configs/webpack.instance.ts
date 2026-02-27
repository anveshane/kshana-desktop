import { createRequire } from 'module';
import path from 'path';

const requireFromRoot = createRequire(
  path.resolve(__dirname, '../../package.json'),
);

const webpack = requireFromRoot('webpack') as typeof import('webpack');

export default webpack;
