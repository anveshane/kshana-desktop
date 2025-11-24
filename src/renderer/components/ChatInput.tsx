import { FormEvent, useState } from 'react';

type Props = {
  disabled?: boolean;
  placeholder?: string;
  onSend: (message: string) => void;
};

export default function ChatInput({
  disabled = false,
  placeholder = 'Describe your story, ask for a storyboard, or request assets…',
  onSend,
}: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      return;
    }
    onSend(value.trim());
    setValue('');
  };

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
      />
      <div className="chat-input-actions">
        <button type="submit" disabled={disabled || !value.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}

