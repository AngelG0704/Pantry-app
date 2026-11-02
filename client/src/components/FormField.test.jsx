import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormField from './FormField.jsx';

function renderField(props = {}) {
  const onChange = vi.fn();
  render(
    <FormField id="email" label="Email" value="" onChange={onChange} {...props} />
  );
  return { onChange, input: screen.getByLabelText(props.label ?? 'Email') };
}

describe('FormField', () => {
  it('links the label to a text input and reports typed text, not the event', async () => {
    const user = userEvent.setup();
    const { onChange, input } = renderField();

    await user.type(input, 'x');

    expect(input).toHaveAttribute('type', 'text');
    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('marks nothing as invalid when there is no error', () => {
    const { input } = renderField();

    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('shows the error and ties it to the input for assistive technology', () => {
    const { input } = renderField({ error: 'A valid email is required' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('A valid email is required');
    expect(screen.getByText('A valid email is required')).toHaveAttribute(
      'id',
      'email-error'
    );
  });

  it('passes the type and autocomplete hint through to the input', () => {
    const { input } = renderField({
      id: 'pw',
      label: 'Password',
      type: 'password',
      autoComplete: 'new-password',
    });

    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
  });
});