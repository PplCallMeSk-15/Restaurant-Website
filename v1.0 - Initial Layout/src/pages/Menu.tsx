import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { MenuItem } from '../types';
import { useCartStore } from '../store/useCartStore';
import { ShoppingCart, Plus, Minus, Info, Flame, Search, Utensils, AlertTriangle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToSettings, isOrderingOpen, convert24to12 } from '../services/settingsService';
import { ChefLoader } from '../components/ChefLoader';

const categories = ['All', 'Appetizers', 'Main Course', 'Breads', 'Desserts', 'Drinks'];

const Menu = () => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [flyingItems, setFlyingItems] = useState<{ id: string; startX: number; startY: number; image: string }[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(true);
  const addItem = useCartStore((state) => state.addItem);

  useEffect(() => {
    const unsubscribeSettings = subscribeToSettings((data) => {
      setSettings(data);
      if (data) {
        setIsOpen(isOrderingOpen(data));
      }
    });
    return () => unsubscribeSettings();
  }, []);

  useEffect(() => {
    if (!settings) return;
    
    // Periodically update the ordering open state so it updates in real-time
    const checkInterval = setInterval(() => {
      setIsOpen(isOrderingOpen(settings));
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [settings]);

  useEffect(() => {
    const q = query(collection(db, 'menu_items'), where('isAvailable', '==', true));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const menuData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      
      setItems(menuData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching menu:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredItems = items.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAddToCart = (item: MenuItem, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isOpen) {
      toast.error('Ordering is currently closed.');
      return;
    }
    // Exact button center calculations for the flight path initiation
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    const flyId = `${item.id}-${Date.now()}`;
    setFlyingItems((prev) => [...prev, { id: flyId, startX, startY, image: item.imageUrl || item.image || '' }]);

    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.imageUrl || item.image,
      quantity: 1,
    });

    setTimeout(() => {
      setFlyingItems((current) => current.filter((f) => f.id !== flyId));
    }, 900);

    toast.success(`${item.name} added to cart!`, {
      style: { background: '#1c1c1c', color: '#fff' },
      icon: '🛒'
    });
  };

  if (loading) {
    return <ChefLoader message="Opening the royal menu of craft spices..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="max-w-xl">
             <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight underline selection:bg-orange-200">Our Culinary <span className="text-orange-600 italic">Masterpieces</span></h1>
             <p className="text-gray-650 text-lg">Every dish is crafted with heritage spices and passion, bringing you the true essence of Spice Garden.</p>
          </div>
          
          <div className="relative w-full md:w-80 group">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
             <input 
                type="text" 
                placeholder="Search for dishes..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
             />
          </div>
        </div>

        {/* Ordering Restriction Banner */}
        {settings && !isOpen && (
          <div className="mb-12 p-6 bg-red-50 border border-red-100 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 text-left">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shrink-0">
                {settings.menuEnabled === false ? <AlertTriangle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="font-extrabold text-red-950 uppercase tracking-wider text-xs">Ordering Closed</h3>
                <p className="text-red-800 text-sm mt-0.5 font-semibold leading-relaxed">
                  {settings.menuEnabled === false 
                    ? 'Online food ordering is temporarily disabled by the Administrator.' 
                    : `We are currently closed for food orders. Hours inside ordering schedule: ${convert24to12(settings.orderStartTime || '09:00')} to ${convert24to12(settings.orderEndTime || '22:00' )}.`}
                </p>
              </div>
            </div>
            <div className="px-5 py-2.5 bg-red-600/10 text-red-600 border border-red-205 text-xs font-black uppercase tracking-widest rounded-xl shrink-0">
              Not Accessing Orders
            </div>
          </div>
        )}

        {/* Categories Bar */}
        <div className="flex overflow-x-auto pb-4 mb-12 no-scrollbar gap-3">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-6 py-2.5 rounded-full whitespace-nowrap font-semibold transition-all duration-300 border ${
                activeCategory === category
                  ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-200 scale-105'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-[2rem] overflow-hidden shadow-sm hover:shadow-xl hover:shadow-orange-100/50 transition-all group border border-gray-100 flex flex-col h-full"
              >
                <div className="relative h-56 overflow-hidden">
                  <img
                    src={item.imageUrl || item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold text-gray-900 border border-gray-100">
                    ₹{item.price.toFixed(2)}
                  </div>
                  {item.spicyLevel && item.spicyLevel > 0 && (
                     <div className="absolute top-4 left-4 flex gap-0.5">
                        {[...Array(item.spicyLevel)].map((_, i) => (
                           <div key={i} className="bg-red-500/90 backdrop-blur-md p-1 rounded-full text-white shadow-sm">
                              <Flame className="w-3.5 h-3.5 fill-current" />
                           </div>
                        ))}
                     </div>
                  )}
                </div>

                <div className="p-6 flex flex-col flex-grow">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-orange-600 transition-colors">{item.name}</h3>
                  </div>
                  <p className="text-gray-500 text-sm mb-6 flex-grow line-clamp-2">{item.description}</p>
                  
                  <button
                    onClick={(e) => handleAddToCart(item, e)}
                    disabled={!item.isAvailable || !isOpen}
                    className={`w-full py-3.5 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all ${
                      item.isAvailable && isOpen
                        ? 'bg-gray-900 text-white hover:bg-orange-600 shadow-lg shadow-gray-200'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {!isOpen ? (
                      settings?.menuEnabled === false ? (
                        <span>Temporarily Not Available</span>
                      ) : (
                        <span>Ordering Closed</span>
                      )
                    ) : item.isAvailable ? (
                      <>
                        <Plus className="w-5 h-5" />
                        <span>Add to Order</span>
                      </>
                    ) : (
                      'Out of Stock'
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredItems.length === 0 && (
           <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-200">
              <Utensils className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-400">No dishes found in this category</h3>
              <p className="text-gray-400">Try searching for something else or browse another category.</p>
           </div>
        )}
      </div>

      {/* Noticeable Flying Add-To-Cart Animation */}
      <AnimatePresence>
        {flyingItems.map((fly) => (
          <motion.div
            key={fly.id}
            initial={{
              position: 'fixed',
              left: fly.startX - 32,
              top: fly.startY - 32,
              width: 64,
              height: 64,
              opacity: 1,
              scale: 1,
              zIndex: 9999,
            }}
            animate={{
              left: window.innerWidth > 768 ? window.innerWidth - 120 : window.innerWidth - 70,
              top: 24,
              opacity: 0.1,
              scale: 0.2,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.8,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="pointer-events-none rounded-full overflow-hidden border-2 border-orange-500 shadow-2xl"
          >
            {fly.image ? (
              <img src={fly.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
               <div className="w-full h-full bg-orange-600 flex items-center justify-center text-white text-xs font-black">🛒</div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default Menu;
