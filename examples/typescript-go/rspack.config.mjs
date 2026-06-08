import { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';

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
          jsc: {
            parser: {
              syntax: 'typescript',
            },
          },
        },
      },
    ],
  },
  plugins: [
    new TsCheckerRspackPlugin({
      typescript: {
        tsgo: true,
      },
    }),
  ],
};
