import { Route, Routes } from 'react-router';
import { useSearchState } from './hooks/useSearchState.js';
import SiteHeader from './components/SiteHeader.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import HomePage from './pages/HomePage.jsx';
import RecipePage from './pages/RecipePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import PantryPage from './pages/PantryPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function App() {
  const search = useSearchState();

  return (
    <>
      <title>Pantry App</title>
      <SiteHeader />

      <main>
        <Routes>
          <Route path="/" element={<HomePage search={search} />} />
          <Route path="/recipes/:id" element={<RecipePage search={search} />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/pantry"
            element={
              <RequireAuth>
                <PantryPage search={search} />
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;