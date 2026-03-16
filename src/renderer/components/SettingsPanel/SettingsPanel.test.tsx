import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
jest.mock('react', () => jest.requireActual('react'));
import SettingsPanel from './SettingsPanel';

describe('SettingsPanel', () => {
  it('calls onThemeChange when a theme card is selected', () => {
    const onThemeChange = jest.fn();

    render(
      <SettingsPanel
        isOpen
        settings={{
          comfyuiMode: 'inherit',
          comfyuiUrl: '',
          comfyuiTimeout: 1800,
          themeId: 'studio-neutral',
        }}
        onClose={jest.fn()}
        onThemeChange={onThemeChange}
        onSaveConnection={jest.fn()}
        isSavingConnection={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByText('Deep Forest & Gold'));
    expect(onThemeChange).toHaveBeenCalledWith('deep-forest-gold');
  });
});
