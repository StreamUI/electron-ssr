import { ElectronSSR } from './main/ElectronSSR';

export { ElectronSSR };
export * from './main/types';

/**
 * Factory function to create an ElectronSSR instance
 */
export function createSSR(options = {}) {
  return new ElectronSSR(options);
}

export default {
  ElectronSSR,
  createSSR
}; 