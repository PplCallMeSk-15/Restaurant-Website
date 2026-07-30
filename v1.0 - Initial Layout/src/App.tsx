import React from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom';
import { Toaster, useToasterStore, toast } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ReservationBanner from './components/ReservationBanner';
import Home from './pages/Home';
import Menu from './pages/Menu';
import Reservation from './pages/Reservation';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import OrderHistory from './pages/OrderHistory';
import Contact from './pages/Contact';
import Profile from './pages/Profile';
import ProfileSetup from './pages/ProfileSetup';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminMenu from './pages/Admin/AdminMenu';
import AdminOrders from './pages/Admin/AdminOrders';
import AdminReservations from './pages/Admin/AdminReservations';
import AdminTables from './pages/Admin/AdminTables';
import AdminSettings from './pages/Admin/AdminSettings';
import AdminDelivery from './pages/Admin/AdminDelivery';
import DeliveryPartnerLogin from './pages/DeliveryPartner/DeliveryPartnerLogin';
import DeliveryDashboard from './pages/DeliveryPartner/DeliveryDashboard';
import LiveTracking from './pages/LiveTracking';

import AdminRoute from './components/Admin/AdminRoute';
import { assignTables } from './services/tableService';
import { useBookingSync } from './hooks/useBookingSync';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase/config';

import { NotificationProvider } from './context/NotificationContext';

async function testConnection() {
  try {
    // Attempting to get a doc from server to verify connection
    // This matches the rule in firestore.rules
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error?.message?.includes('the client is offline') || error?.code === 'unavailable') {
      console.error("Please check your Firebase configuration.");
    }
  }
}

const Root = () => {
  const { pathname } = useLocation();
  useBookingSync();
  
  const { user, profile, isAdmin } = useAuth();
  const isProfileIncomplete = user && !isAdmin && (!profile?.address || profile?.phone === '' || profile?.latitude === null);
  const showReminder = isProfileIncomplete && pathname !== '/profile-setup' && pathname !== '/profile';

  const { toasts } = useToasterStore();
  
  // Set limit to 2 to prevent toast spamming and overlap, especially on mobile devices
  React.useEffect(() => {
    const visibleToasts = toasts.filter((t) => t.visible);
    const TOAST_LIMIT = 2;
    if (visibleToasts.length > TOAST_LIMIT) {
      const excessCount = visibleToasts.length - TOAST_LIMIT;
      for (let i = 0; i < excessCount; i++) {
        toast.dismiss(visibleToasts[i].id);
      }
    }
  }, [toasts]);
  
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  React.useEffect(() => {
    testConnection();
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <ReservationBanner />
      {/* Dynamic spacer that animates smoothly when the fixed navbar expands with the incomplete profile banner */}
      <AnimatePresence>
        {showReminder && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="w-full shrink-0 overflow-hidden"
          >
            <div className="h-11 sm:h-9" />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1c1c1c',
            color: '#fff',
            borderRadius: '16px',
            padding: '16px 24px',
            fontWeight: '600'
          }
        }}
      />
    </div>
  );
};

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Home /> },
      { path: 'menu', element: <Menu /> },
      { path: 'reservations', element: <Reservation /> },
      { path: 'cart', element: <Cart /> },
      { path: 'checkout', element: <Checkout /> },
      { path: 'login', element: <Login /> },
      { path: 'signup', element: <Signup /> },
      { path: 'profile', element: <Profile /> },
      { path: 'profile-setup', element: <ProfileSetup /> },
      { path: 'orders', element: <OrderHistory /> },
      { path: 'orders/:orderId/track', element: <LiveTracking /> },
      { path: 'delivery-partner/login', element: <DeliveryPartnerLogin /> },
      { path: 'delivery-partner', element: <DeliveryDashboard /> },
      { path: 'contact', element: <Contact /> },
      {
        element: <AdminRoute />,
        children: [
          { path: 'admin', element: <AdminDashboard /> },
          { path: 'admin/menu', element: <AdminMenu /> },
          { path: 'admin/orders', element: <AdminOrders /> },
          { path: 'admin/delivery', element: <AdminDelivery /> },
          { path: 'admin/reservations', element: <AdminReservations /> },
          { path: 'admin/tables', element: <AdminTables /> },
          { path: 'admin/settings', element: <AdminSettings /> },
        ],
      },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <RouterProvider router={router} />
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
