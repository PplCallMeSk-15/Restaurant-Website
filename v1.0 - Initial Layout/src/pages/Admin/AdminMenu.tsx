import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { MenuItem } from '../../types';
import { Plus, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MenuList from '../../components/Admin/MenuList';
import MenuForm from '../../components/Admin/MenuForm';
import { deleteDoc, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';

import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

const AdminMenu = () => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'menu_items'), orderBy('category'), orderBy('name'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const menuData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      setItems(menuData);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'menu_items');
    });

    return () => unsubscribe();
  }, []);

  const openAddModal = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setItemToDelete(id);
  };

  const confirmDelete = async (id: string) => {
    try {
      console.log('Attempting to delete menu item:', id);
      await deleteDoc(doc(db, 'menu_items', id));
      toast.success('Item removed from menu');
      setItemToDelete(null);
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMessage = error.code === 'permission-denied' 
        ? 'Permission denied: Admin rights required' 
        : error.message || 'Failed to delete item';
      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl space-y-6 border border-gray-100"
            >
              <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-10 h-10 text-red-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Delete Item?</h2>
                <p className="text-gray-500 font-medium leading-relaxed">
                  Are you sure you want to delete <strong>{items.find(i => i.id === itemToDelete)?.name}</strong>? 
                  This will permanently remove it from your menu.
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={() => confirmDelete(itemToDelete)}
                  className="w-full py-5 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
                >
                  Yes, Remove Item
                </button>
                <button
                  onClick={() => setItemToDelete(null)}
                  className="w-full py-5 bg-gray-100 text-gray-900 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                >
                  No, Keep It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
            <div className="flex items-center gap-4">
                <button 
                  onClick={() => navigate('/admin')} 
                  className="p-3 bg-white rounded-2xl shadow-sm hover:text-orange-600 transition-all active:scale-95"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <div>
                  <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Menu Store</h1>
                  <p className="text-gray-500 font-medium">Manage your restaurant offerings</p>
                </div>
            </div>
            <button 
                onClick={openAddModal}
                className="bg-orange-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center shadow-lg shadow-orange-200 hover:bg-orange-700 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
                <Plus className="w-5 h-5 mr-2" /> 
                <span>Add Item</span>
            </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
             <Loader2 className="w-12 h-12 text-orange-600 animate-spin" />
             <p className="text-gray-400 font-bold animate-pulse uppercase tracking-widest text-[10px]">Synchronizing Catalog</p>
          </div>
        ) : (
          <MenuList 
            items={items} 
            onEdit={openEditModal} 
            onDelete={handleDelete}
          />
        )}

        {/* Modal for adding/editing */}
        {isModalOpen && (
          <MenuForm 
            item={editingItem}
            onClose={() => setIsModalOpen(false)}
            onSuccess={() => setIsModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

export default AdminMenu;
