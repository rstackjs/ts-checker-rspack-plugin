import { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';
import { HtmlRspackPlugin } from '@rspack/core';

export default {
  entry: './src/index.ts',
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'builtin:swc-loader',
        options: {
          detectSyntax: 'auto',
        },
      },
    ],
  },
  plugins: [new TsCheckerRspackPlugin(), new HtmlRspackPlugin()],
};
