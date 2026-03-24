import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import ProjectSetupPanel from './ProjectSetupPanel';

const templates = [
  {
    id: 'narrative',
    displayName: 'Narrative Story Video',
    description: 'Story-driven video workflow.',
    defaultStyle: 'cinematic_realism',
    styles: [
      {
        id: 'cinematic_realism',
        displayName: 'Cinematic Realism',
        description: 'High-end cinematic look.',
      },
    ],
  },
];

const durationPresets = {
  narrative: [
    { label: '1 minute', seconds: 60 },
    { label: '2 minutes', seconds: 120 },
  ],
};

function renderPanel() {
  const onOpenWizard = jest.fn();
  const onEditSetup = jest.fn();
  const onSelectTemplate = jest.fn();
  const onSelectStyle = jest.fn();
  const onSelectDuration = jest.fn();
  const onSelectAutonomousMode = jest.fn();
  const onConfirmSetup = jest.fn();
  const onBack = jest.fn();

  render(
    <ProjectSetupPanel
      mode="wizard"
      step="autonomous"
      templates={templates}
      durationPresets={durationPresets}
      selectedTemplateId="narrative"
      selectedStyleId="cinematic_realism"
      selectedDuration={120}
      selectedAutonomousMode={false}
      loading={false}
      configuring={false}
      error={null}
      onOpenWizard={onOpenWizard}
      onEditSetup={onEditSetup}
      onSelectTemplate={onSelectTemplate}
      onSelectStyle={onSelectStyle}
      onSelectDuration={onSelectDuration}
      onSelectAutonomousMode={onSelectAutonomousMode}
      onConfirmSetup={onConfirmSetup}
      onBack={onBack}
    />,
  );

  return {
    onOpenWizard,
    onEditSetup,
    onSelectTemplate,
    onSelectStyle,
    onSelectDuration,
    onSelectAutonomousMode,
    onConfirmSetup,
    onBack,
  };
}

describe('ProjectSetupPanel', () => {
  it('renders the autonomous setup step with a continue action', () => {
    const props = renderPanel();

    expect(screen.queryByText('Step 4 of 4')).not.toBeNull();
    expect(screen.queryByText('Autonomous Mode')).not.toBeNull();

    fireEvent.click(screen.getByText('Autonomous'));
    expect(props.onSelectAutonomousMode).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(props.onConfirmSetup).toHaveBeenCalled();
  });

  it('shows the autonomous badge in summary mode when enabled', () => {
    render(
      <ProjectSetupPanel
        mode="summary"
        step="autonomous"
        templates={templates}
        durationPresets={durationPresets}
        selectedTemplateId="narrative"
        selectedStyleId="cinematic_realism"
        selectedDuration={120}
        selectedAutonomousMode
        loading={false}
        configuring={false}
        error={null}
        onOpenWizard={jest.fn()}
        onEditSetup={jest.fn()}
        onSelectTemplate={jest.fn()}
        onSelectStyle={jest.fn()}
        onSelectDuration={jest.fn()}
        onSelectAutonomousMode={jest.fn()}
        onConfirmSetup={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.queryByText('Autonomous')).not.toBeNull();
  });
});
