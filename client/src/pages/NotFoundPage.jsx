import { Link } from 'react-router';

function NotFoundPage() {
  return (
    <div>
      <h2>Page not found</h2>
      <p>There&apos;s nothing at this address.</p>
      <p>
        <Link to="/">Go back to the pantry</Link>
      </p>
    </div>
  );
}

export default NotFoundPage;