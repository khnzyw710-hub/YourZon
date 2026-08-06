interface ScreenDetailed {
  availHeight: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  height: number;
  width: number;
  left: number;
  top: number;
  isPrimary: boolean;
  isInternal: boolean;
  label: string;
}

interface ScreenDetails extends EventTarget {
  screens: readonly ScreenDetailed[];
  currentScreen: ScreenDetailed;
}

interface Window {
  getScreenDetails(): Promise<ScreenDetails>;
}
