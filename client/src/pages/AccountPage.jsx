import { useAuth } from '../auth/useAuth.js';

function AccountPage() {
  const { user } = useAuth();

  return (
    <section>
      <h2>Your account</h2>
      <dl>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Member since</dt>
        <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
      </dl>
    </section>
  );
}

export default AccountPage;