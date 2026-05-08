import { Plugin } from 'vite';

export interface LovableTaggerOptions {
  jsxSource?: boolean;
  tailwindConfig?: boolean;
  virtualOverrides?: boolean;
  debug?: boolean;
}

export declare function componentTagger(options?: LovableTaggerOptions): Plugin;
