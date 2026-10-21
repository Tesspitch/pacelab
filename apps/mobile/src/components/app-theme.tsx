import type { PropsWithChildren } from 'react';

export type AppThemeMode = 'light';

export function AppThemeProvider({ children }: PropsWithChildren) {
  return children;
}

export function useAppTheme() {
  return { mode: 'light' as const };
}
