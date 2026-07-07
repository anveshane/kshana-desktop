import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import '../../../testing/installFakeBridge';
import { FileCardBody } from './FileCardBody';

describe('FileCardBody', () => {
  beforeEach(() => {
    window.__dheeTest?.reset();
  });

  it('renders a CSV artifact with a direct download action', () => {
    render(
      <FileCardBody
        projectDir="/tmp/dhee-project"
        outputPath="research/research_compendium_all.csv"
      />,
    );

    expect(screen.getByText('CSV export')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(window.__dheeTest?.getCalls('project.saveMediaFile')).toEqual([
      expect.objectContaining({
        args: {
          sourcePath: '/tmp/dhee-project/research/research_compendium_all.csv',
          defaultName: 'research/research_compendium_all.csv',
        },
      }),
    ]);
  });
});
