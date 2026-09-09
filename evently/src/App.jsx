import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Router as WouterRouter, Switch } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout';
import { restoreSession } from '@/lib/api';
import CategoriesPage from '@/pages/categories';
import CheckInPage from '@/pages/check-in';
import DashboardPage from '@/pages/dashboard';
import EventFormPage from '@/pages/events/create';
import EventDetailPage from '@/pages/events/detail';
import EventsPage from '@/pages/events/index';
import HomePage from '@/pages/home';
import LoginPage from '@/pages/login';
import MetricsPage from '@/pages/metrics';
import NotFound from '@/pages/not-found';
import OrdersPage from '@/pages/orders';
import OrderDetailPage from '@/pages/orders/detail';
import RegisterPage from '@/pages/register';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function ProtectedRoute({ component: Component, organizerOnly = false, userOnly = false }) {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    restoreSession().then((user) => setState({ loading: false, user }));
  }, []);

  if (state.loading) return <div className="container mx-auto px-4 py-20">Restoring session...</div>;
  if (!state.user) return <Redirect to="/login" />;
  if (organizerOnly && state.user.role !== 'organizer') return <Redirect to="/events" />;
  if (userOnly && state.user.role !== 'user') return <Redirect to="/events" />;
  return <Component />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/events/create">{() => <ProtectedRoute component={EventFormPage} organizerOnly />}</Route>
            <Route path="/events/:id/edit">{() => <ProtectedRoute component={EventFormPage} organizerOnly />}</Route>
            <Route path="/events/:id" component={EventDetailPage} />
            <Route path="/events" component={EventsPage} />
            <Route path="/categories" component={CategoriesPage} />
            <Route path="/dashboard">{() => <ProtectedRoute component={DashboardPage} organizerOnly />}</Route>
            <Route path="/check-in">{() => <ProtectedRoute component={CheckInPage} organizerOnly />}</Route>
            <Route path="/metrics">{() => <ProtectedRoute component={MetricsPage} organizerOnly />}</Route>
            <Route path="/orders/:id">{() => <ProtectedRoute component={OrderDetailPage} userOnly />}</Route>
            <Route path="/orders">{() => <ProtectedRoute component={OrdersPage} userOnly />}</Route>
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
