import type { ThemeMode } from './types';

export const colors = {
  navy: '#062C54',
  navyBright: '#0D4C80',
  orange: '#FF9800',
  orangeDeep: '#F46A12',
  green: '#48A82F',
  red: '#D94242',
  white: '#FFFFFF',
};

export type AppTheme = ReturnType<typeof getTheme>;

export function getTheme(mode: ThemeMode) {
  const dark = mode === 'dark';

  return {
    dark,
    background: dark ? '#07111F' : '#F7F8FB',
    surface: dark ? '#101E30' : '#FFFFFF',
    surfaceRaised: dark ? '#16273B' : '#FFFFFF',
    text: dark ? '#F4F7FB' : '#102B4C',
    muted: dark ? '#9DAFC3' : '#6E7480',
    faint: dark ? '#23364C' : '#EEF1F5',
    border: dark ? '#2A3C50' : '#E4E8EF',
    input: dark ? '#0B1726' : '#FBFCFE',
    shadow: dark ? '#000000' : '#15304D',
    primary: dark ? '#F5F8FC' : colors.navy,
    nav: dark ? '#0B1828' : '#FFFFFF',
    successSoft: dark ? '#173822' : '#EDF7E9',
    orangeSoft: dark ? '#3B2A0E' : '#FFF4E3',
    blueSoft: dark ? '#142E49' : '#EAF2FA',
    redSoft: dark ? '#3C1C22' : '#FFF0F0',
    info: dark ? '#7BC4F6' : colors.navyBright,
    success: dark ? '#77D55E' : colors.green,
    warning: dark ? '#FFB044' : colors.orangeDeep,
  };
}

export const layout = {
  maxWidth: 720,
  screenPadding: 20,
  radiusLarge: 26,
  radiusMedium: 18,
  radiusSmall: 12,
};
