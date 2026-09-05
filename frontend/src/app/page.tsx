import { redirect } from 'next/navigation';

// Root route redirects to /submit-url (or /login if not authenticated —
// AppLayout handles that client-side guard)
export default function HomePage() {
  redirect('/submit-url');
}
