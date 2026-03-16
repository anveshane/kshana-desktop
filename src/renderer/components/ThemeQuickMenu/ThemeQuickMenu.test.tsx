import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
jest.mock('react', () => jest.requireActual('react'));
import ThemeQuickMenu from './ThemeQuickMenu';

const updateTheme = jest.fn();
const openSettings = jest.fn();

jest.mock('../../contexts/AppSettingsContext', () => ({
  useAppSettings: () => ({
    themeId: 'studio-neutral',
    updateTheme,
    openSettings,
  }),
}));

describe('ThemeQuickMenu', () => {
  beforeEach(() => {
    updateTheme.mockClear();
    openSettings.mockClear();
    updateTheme.mockResolvedValue(undefined);
  });

  it('updates theme from the quick menu', async () => {
    render(<ThemeQuickMenu trigger={<span>Settings</span>} />);

    fireEvent.click(screen.getByText('Settings'));
    await act(async () => {
      fireEvent.click(screen.getByText('Petroleum & Clay'));
    });

    expect(updateTheme).toHaveBeenCalledWith('petroleum-clay');
  });

  it('opens the settings modal from the quick menu', () => {
    render(<ThemeQuickMenu trigger={<span>Settings</span>} />);

    fireEvent.click(screen.getByText('Settings'));
    fireEvent.click(screen.getByText('Open Settings'));

    expect(openSettings).toHaveBeenCalled();
  });
});
