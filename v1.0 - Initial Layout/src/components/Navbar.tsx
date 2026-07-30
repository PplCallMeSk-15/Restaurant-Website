import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Menu as MenuIcon, X, Leaf, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCartStore } from '../store/useCartStore';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../firebase/config';

import { useNotifications } from '../context/NotificationContext';

const Navbar = () => {
  const { user, profile, isAdmin } = useAuth();
  const [hasDriverSession, setHasDriverSession] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsOpen(false);
      setShowDropdown(false);
    };

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const checkSession = () => {
      setHasDriverSession(!!localStorage.getItem('delivery_partner_session'));
    };
    checkSession();
    window.addEventListener('storage', checkSession);
    const interval = setInterval(checkSession, 1500);

    return () => {
      window.removeEventListener('storage', checkSession);
      clearInterval(interval);
    };
  }, []);
  const { items } = useCartStore();
  const { 
    pendingOrdersCount, 
    pendingReservationsCount, 
    activeUserOrdersCount, 
    activeUserReservationsCount,
    userReservationBadgeColor 
  } = useNotifications();
  const totalAdminNotifications = pendingOrdersCount + pendingReservationsCount;
  const totalUserNotifications = activeUserOrdersCount + activeUserReservationsCount;

  const getUserBadgeColor = () => {
    if (userReservationBadgeColor === 'red') return 'bg-red-600';
    if (userReservationBadgeColor === 'green') return 'bg-green-600';
    return 'bg-orange-600';
  };
  const [isOpen, setIsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  const isProfileIncomplete = user && !isAdmin && (!profile?.address || profile?.phone === '' || profile?.latitude === null);
  const showReminder = isProfileIncomplete && window.location.pathname !== '/profile-setup' && window.location.pathname !== '/profile';

  const handleLogout = async () => {
    if (user) {
      localStorage.removeItem('otp_verified_' + user.uid);
      sessionStorage.removeItem('otp_verified_' + user.uid);
    }
    setShowDropdown(false);
    await auth.signOut();
    navigate('/');
  };

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Menu', path: '/menu' },
    { name: 'Reservations', path: '/reservations' },
  ];

  return (
    <nav ref={navRef} className="fixed top-0 left-0 right-0 z-50 bg-white md:bg-white/80 md:backdrop-blur-md transform-gpu">
      {/* Complete Profile Setup Banner Notification */}
      <AnimatePresence>
        {showReminder && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-800 flex justify-center items-center gap-2"
          >
            <span className="flex items-center gap-1.5">
              🌿 Address setup incomplete! Pin your doorstep location for high accuracy delivery.
              <Link to="/profile-setup" className="underline text-orange-700 hover:text-orange-850 font-extrabold ml-1.5">
                Setup now &rarr;
              </Link>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform shadow-lg shadow-orange-200">
              <span className="text-xl font-bold">S</span>
            </div>
            <span className="text-2xl font-bold tracking-tight text-gray-900">
              Spice<span className="text-orange-600">Garden</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className="text-gray-600 hover:text-orange-600 font-medium transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="hidden md:flex items-center space-x-5">
            <Link to="/cart" className="relative p-2 text-gray-600 hover:text-orange-600 transition-colors">
              <ShoppingCart className="w-6 h-6" />
              {items.length > 0 && (
                <motion.span
                  key={items.length}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: [1.4, 0.9, 1.1, 1], opacity: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute top-0 right-0 bg-orange-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white"
                >
                  {items.length}
                </motion.span>
              )}
            </Link>

            <Link
              to={hasDriverSession ? "/delivery-partner" : "/delivery-partner/login"}
              className="text-gray-600 hover:text-orange-600 font-bold text-[10px] uppercase tracking-wider bg-gray-50 border border-gray-200 hover:bg-orange-50/50 hover:border-orange-200 px-3.5 py-2 rounded-full transition-all flex items-center gap-1.5 shrink-0"
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-600"></span>
              </span>
              <span>{hasDriverSession ? "Driver Hub 🚚" : "Driver Shift"}</span>
            </Link>

            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center space-x-2 p-1.5 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors focus:outline-none cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                    <User className="w-5 h-5" />
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDropdown && (
                  <div 
                    className="fixed inset-0 z-30 cursor-default" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDropdown(false);
                    }}
                  />
                )}

                <div className={`absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 transition-all duration-200 transform origin-top-right z-40 ${showDropdown ? 'opacity-100 visible scale-100 translate-y-0' : 'opacity-0 invisible scale-95 -translate-y-2 pointer-events-none'}`}>
                  <div className="py-2">
                    <div className="px-4 py-2 border-bottom border-gray-100">
                      <p className="text-sm font-semibold truncate">{profile?.displayName || user.email}</p>
                      <p className="text-xs text-gray-500 capitalize">{profile?.role || 'Guest'}</p>
                    </div>
                    {/* My Profile option */}
                    <Link 
                      to="/profile" 
                      onClick={() => setShowDropdown(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                    >
                      <span>My Profile</span>
                    </Link>
                    {isAdmin && (
                      <>
                        <Link 
                          to="/admin" 
                          onClick={() => setShowDropdown(false)}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between"
                        >
                          <span>Admin Dashboard</span>
                          {totalAdminNotifications > 0 && (
                            <span className="bg-orange-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                              {totalAdminNotifications}
                            </span>
                          )}
                        </Link>
                        <Link 
                          to="/admin/delivery" 
                          onClick={() => setShowDropdown(false)}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                        >
                          <span>Delivery Operations</span>
                        </Link>
                      </>
                    )}
                    <Link 
                      to="/orders" 
                      onClick={() => setShowDropdown(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between"
                    >
                      <span>Order History</span>
                      {totalUserNotifications > 0 && (
                        <span className={`${getUserBadgeColor()} text-white text-[10px] font-black px-1.5 py-0.5 rounded-full`}>
                          {totalUserNotifications}
                        </span>
                      )}
                    </Link>
                    <Link 
                      to={hasDriverSession ? "/delivery-partner" : "/delivery-partner/login"}
                      onClick={() => setShowDropdown(false)}
                      className="block px-4 py-2 text-sm text-gray-500 hover:bg-orange-50 hover:text-orange-600 border-t border-gray-150"
                    >
                      <span>{hasDriverSession ? "Active Driver Hub 🚚" : "Driver Fleet Shift"}</span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                className="bg-orange-600 text-white px-6 py-2.5 rounded-full font-semibold hover:bg-orange-700 transition-all shadow-md shadow-orange-100"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-4">
             <Link to="/cart" className="relative p-2 text-gray-600">
              <ShoppingCart className="w-6 h-6" />
              {items.length > 0 && (
                <motion.span
                  key={items.length}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: [1.4, 0.9, 1.1, 1], opacity: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute top-0 right-0 bg-orange-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full"
                >
                  {items.length}
                </motion.span>
              )}
            </Link>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-gray-600 hover:text-orange-600 focus:outline-none"
            >
              {isOpen ? <X className="w-7 h-7" /> : <MenuIcon className="w-7 h-7" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-gray-100 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.path}
                  className="block px-4 py-3 text-lg font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 rounded-xl transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  {link.name}
                </Link>
              ))}
              <hr className="my-2 border-gray-100" />
              {user ? (
                <>
                  <Link
                    to="/profile"
                    className="block px-4 py-3 text-lg font-medium text-gray-700 hover:bg-orange-50 rounded-xl animate-fade-in"
                    onClick={() => setIsOpen(false)}
                  >
                    My Profile
                  </Link>
                  <Link
                    to="/orders"
                    className="flex items-center justify-between px-4 py-3 text-lg font-medium text-gray-700 hover:bg-orange-50 rounded-xl"
                    onClick={() => setIsOpen(false)}
                  >
                    <span>My Orders</span>
                    {totalUserNotifications > 0 && (
                      <span className={`${getUserBadgeColor()} text-white text-xs font-black px-2 py-1 rounded-full`}>
                        {totalUserNotifications}
                      </span>
                    )}
                  </Link>
                  {isAdmin && (
                    <>
                      <Link
                        to="/admin"
                        className="flex items-center justify-between px-4 py-3 text-lg font-medium text-orange-600 hover:bg-orange-50 rounded-xl"
                        onClick={() => setIsOpen(false)}
                      >
                        <span>Admin Dashboard</span>
                        {totalAdminNotifications > 0 && (
                          <span className="bg-orange-600 text-white text-xs font-black px-2 py-1 rounded-full">
                            {totalAdminNotifications}
                          </span>
                        )}
                      </Link>
                      <Link
                        to="/admin/delivery"
                        className="block px-4 py-3 text-lg font-medium text-gray-700 hover:bg-orange-50 rounded-xl"
                        onClick={() => setIsOpen(false)}
                      >
                        Delivery Operations
                      </Link>
                    </>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 text-lg font-medium text-red-600 hover:bg-red-50 rounded-xl"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="block px-4 py-3 text-center bg-orange-600 text-white font-semibold rounded-xl"
                  onClick={() => setIsOpen(false)}
                >
                  Login / Sign Up
                </Link>
              )}

              {/* Seamless common mobile portal for driver shifts outside of customer session */}
              <div className="pt-3 border-t border-gray-100">
                <Link
                  to={hasDriverSession ? "/delivery-partner" : "/delivery-partner/login"}
                  className="block px-4 py-3 text-base font-bold text-gray-600 hover:bg-orange-50 hover:text-orange-600 rounded-xl transition-all"
                  onClick={() => setIsOpen(false)}
                >
                  {hasDriverSession ? "Active Driver Hub 🚚" : "💼 Driver Fleet Shift"}
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
