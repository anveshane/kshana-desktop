import { ElectronHandler } from '../main/preload';

type DesktopElectronHandler = ElectronHandler & {
  app: {
    getVersion(): Promise<string>;
  };
};

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: DesktopElectronHandler;
  }
}

export {};
