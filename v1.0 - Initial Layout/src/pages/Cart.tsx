import React from 'react';
import { useCartStore } from '../store/useCartStore';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, ChevronLeft, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const Cart = () => {
  const { items, removeItem, updateQuantity, getTotal } = useCartStore();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-32 pb-20 flex flex-col items-center justify-center bg-gray-50 px-4">
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
        >
            <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center text-gray-200 mb-8 mx-auto shadow-sm">
                <ShoppingBag className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Your basket is empty</h2>
            <p className="text-gray-500 mb-10 max-w-sm mx-auto">Looks like you haven't added anything to your cart yet. Let's find some delicious spices!</p>
            <Link
                to="/menu"
                className="bg-orange-600 text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-orange-700 transition-all shadow-xl shadow-orange-100"
            >
                Browse Menu
            </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-4 mb-10">
            <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-xl shadow-sm hover:text-orange-600 transition-colors">
                <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="text-4xl font-bold text-gray-900">Your Basket <span className="text-orange-600 text-2xl ml-2">({items.length} items)</span></h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Item List */}
          <div className="lg:w-2/3 space-y-6">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-6 group"
                >
                  <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-inner bg-gray-50">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                        <h3 className="text-xl font-bold text-gray-900 mb-1">{item.name}</h3>
                        <p className="text-xl font-bold text-orange-600">₹{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                    <p className="text-gray-400 text-sm mb-4">₹{item.price.toFixed(2)} each</p>
                    
                    <div className="flex items-center justify-between">
                        <div className="flex items-center bg-gray-50 rounded-xl p-1">
                            <button
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:text-orange-600 transition-colors"
                            >
                                <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-10 text-center font-bold">{item.quantity}</span>
                            <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:text-orange-600 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            onClick={() => removeItem(item.id)}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            <Link to="/menu" className="inline-flex items-center text-orange-600 font-bold hover:underline py-4">
                <Plus className="w-5 h-5 mr-2" /> Add more items
            </Link>
          </div>

          {/* Summary */}
          <div className="lg:w-1/3">
            <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-orange-100/20 border border-orange-50 sticky top-28">
              <h2 className="text-2xl font-bold mb-8">Order Summary</h2>
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Subtotal</span>
                  <span>₹{getTotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Delivery Fee</span>
                  <span className="text-green-600 font-bold">FREE</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Tax (8%)</span>
                  <span>₹{(getTotal() * 0.08).toFixed(2)}</span>
                </div>
                <hr className="border-gray-100" />
                <div className="flex justify-between text-2xl font-bold text-gray-900">
                  <span>Total</span>
                  <span>₹{(getTotal() * 1.08).toFixed(2)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (authLoading) return;
                  if (!user) {
                    toast.error('Please create an account or login to proceed to checkout!');
                    navigate('/signup', { state: { redirectTo: '/checkout' } });
                  } else {
                    navigate('/checkout');
                  }
                }}
                className="w-full bg-orange-600 text-white py-5 rounded-[2rem] font-bold text-xl flex items-center justify-center hover:bg-orange-700 transition-all shadow-xl shadow-orange-100 cursor-pointer"
              >
                Go to Checkout <ArrowRight className="ml-2 w-6 h-6" />
              </button>
              
              <div className="mt-6 text-center">
                 <p className="text-xs text-gray-400 font-medium flex items-center justify-center">
                    <Award className="w-3 h-3 mr-1" /> Quality & Freshness Guaranteed
                 </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
