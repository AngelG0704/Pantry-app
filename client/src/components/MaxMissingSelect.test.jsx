import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaxMissingSelect from './MaxMissingSelect.jsx';

const LABEL = 'How many missing ingredients are OK?';

describe('MaxMissingSelect', () => {
  it('offers five choices and shows the current one', () => {
    render(<MaxMissingSelect id="m" value="1" onChange={vi.fn()} />);

    expect(screen.getByLabelText(LABEL)).toHaveValue('1');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any number',
      'None (I can make it now)',
      'Up to 1',
      'Up to 2',
      'Up to 3',
    ]);
  });

  it('reports "None" as the string "0", which is a real choice and not "empty"', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MaxMissingSelect id="m" value="" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText(LABEL), 'None (I can make it now)');

    expect(onChange).toHaveBeenCalledWith('0');
  });

  it('reports an empty string when "Any number" is chosen', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MaxMissingSelect id="m" value="1" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText(LABEL), 'Any number');

    expect(onChange).toHaveBeenCalledWith('');
  });
});