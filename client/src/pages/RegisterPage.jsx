import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth.js';
import { toFormErrors } from '../auth/formErrors.js';
import FormField from '../components/FormField.jsx';

const NO_ERRORS = { fields: {}, general: '' };

function RegisterPage() {
  const { status, register } = useAuth();
  const location = useLocation();
  const destination = location.state?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState(NO_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrors(NO_ERRORS);

    try {
      await register(email, password);
    } catch (err) {
      setErrors(toFormErrors(err));
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>Create an account</h2>

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="register-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={errors.fields.email}
        />
        <FormField
          id="register-password"
          label="Password (at least 8 characters)"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={errors.fields.password}
        />

        {errors.general && (
          <p role="alert" className="field-error">
            {errors.general}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p>
        Already registered?{' '}
        <Link to="/login" state={location.state}>
          Log in
        </Link>
      </p>
    </section>
  );
}

export default RegisterPage;