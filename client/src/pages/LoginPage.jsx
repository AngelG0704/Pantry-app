import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth.js';
import { toFormErrors } from '../auth/formErrors.js';
import FormField from '../components/FormField.jsx';

const NO_ERRORS = { fields: {}, general: '' };

function LoginPage() {
  const { status, login } = useAuth();
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
      await login(email, password);
    } catch (err) {
      setErrors(toFormErrors(err));
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>Log in</h2>

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={errors.fields.email}
        />
        <FormField
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
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
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p>
        New here?{' '}
        <Link to="/register" state={location.state}>
          Create an account
        </Link>
      </p>
    </section>
  );
}

export default LoginPage;