import { describe, it, expect } from 'vitest';
import { toFormErrors } from './formErrors.js';

function serverError(message, details) {
  return Object.assign(new Error(message), { details });
}

describe('toFormErrors', () => {
  it('maps each field to its message and leaves the general message empty', () => {
    const err = serverError('email is required', [
      { field: 'email', message: 'email is required' },
      { field: 'password', message: 'password is required' },
    ]);

    expect(toFormErrors(err)).toEqual({
      fields: {
        email: 'email is required',
        password: 'password is required',
      },
      general: '',
    });
  });

  it('keeps only the first message when one field has several problems', () => {
    const err = serverError('Password must be at least 8 characters', [
      { field: 'password', message: 'Password must be at least 8 characters' },
      { field: 'password', message: 'Password must be at most 72 bytes' },
    ]);

    expect(toFormErrors(err).fields).toEqual({
      password: 'Password must be at least 8 characters',
    });
  });

  it('uses the error message as the general message when there are no details', () => {
    expect(toFormErrors(new Error('Invalid email or password'))).toEqual({
      fields: {},
      general: 'Invalid email or password',
    });
  });

  it('treats an empty details list the same as no details', () => {
    expect(toFormErrors(serverError('Something went wrong.', []))).toEqual({
      fields: {},
      general: 'Something went wrong.',
    });
  });
});