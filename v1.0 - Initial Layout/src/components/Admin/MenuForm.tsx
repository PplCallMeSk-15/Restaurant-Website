import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase/config';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { MenuItem } from '../../types';
import { Camera, X, Check, Flame, AlertTriangle, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useBlocker } from 'react-router-dom';

interface MenuFormProps {
  item?: MenuItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

const MenuForm: React.FC<MenuFormProps> = ({ item, onClose, onSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [initialData, setInitialData] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '' as string | number,
    category: 'Main Course',
    image: '',
    imageUrl: '',
    isAvailable: true,
    spicyLevel: 0
  });

  useEffect(() => {
    const data = item ? {
      name: item.name || '',
      description: item.description || '',
      price: item.price || '',
      category: item.category || 'Main Course',
      image: item.image || '',
      imageUrl: item.imageUrl || item.image || '',
      isAvailable: item.isAvailable ?? true,
      spicyLevel: item.spicyLevel || 0
    } : {
      name: '',
      description: '',
      price: '',
      category: 'Main Course',
      image: '',
      imageUrl: '',
      isAvailable: true,
      spicyLevel: 0
    };
    
    setFormData(data);
    setInitialData(data);
  }, [item]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 5MB for processing)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Please upload an image under 5MB.');
      return;
    }

    setUploading(true);
    try {
      // Create a compressed Base64 version of the image
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          // Create canvas for resizing/compression
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Max dimensions for menu item
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Quality 0.7 (70%) keeps size very small (usually <50KB)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setFormData(prev => ({ ...prev, imageUrl: dataUrl, image: dataUrl }));
          setUploading(false);
          toast.success('Image optimized and ready!');
        };
      };
    } catch (error: any) {
      console.error('Image processing failed:', error);
      toast.error('Could not process image');
      setUploading(false);
    }
  };

  const isDirty = initialData && JSON.stringify(formData) !== JSON.stringify(initialData);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.image && !formData.imageUrl) {
        toast.error('Please upload an image first');
        return;
    }

    try {
      const dataToSave = {
        ...formData,
        price: Number(formData.price),
        updatedAt: serverTimestamp(),
      };

      if (item) {
        await updateDoc(doc(db, 'menu_items', item.id), dataToSave);
        toast.success('Item updated successfully');
      } else {
        await addDoc(collection(db, 'menu_items'), {
          ...dataToSave,
          createdAt: serverTimestamp(),
        });
        toast.success('New item added to menu');
      }
      setInitialData(formData);
      onSuccess();
    } catch (error: any) {
        handleFirestoreError(error, item ? OperationType.UPDATE : OperationType.CREATE, 'menu_items');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <AnimatePresence>
        {blocker.state === 'blocked' && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-black text-gray-900">Discard Item Changes?</h2>
                <p className="text-gray-500 font-medium">You have unsaved changes to this dish. Are you sure you want to leave?</p>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={() => blocker.proceed?.()}
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-red-600 transition-all"
                >
                  Discard & Leave
                </button>
                <button
                  onClick={() => blocker.reset?.()}
                  className="w-full py-4 bg-gray-50 text-gray-900 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  Keep Editing
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <motion.div 
         initial={{ opacity: 0, scale: 0.9 }}
         animate={{ opacity: 1, scale: 1 }}
         className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden overflow-y-auto max-h-[90vh]"
      >
        <div className="p-8 md:p-12">
           <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900">{item ? 'Update Dish' : 'Create New Dish'}</h2>
              <button onClick={onClose} className="p-3 hover:bg-gray-100 rounded-full transition-colors">
                 <X className="w-6 h-6" />
              </button>
           </div>
           
           <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-2">
                 <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Dish Image</label>
                 <div className="flex items-center gap-6">
                      <div className="w-32 h-32 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
                          {formData.imageUrl || formData.image ? (
                              <img src={formData.imageUrl || formData.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                              <Camera className="w-8 h-8 text-gray-300" />
                          )}
                          <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleImageUpload}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          {uploading && (
                             <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                             </div>
                          )}
                      </div>
                      <div className="flex-grow">
                         <p className="text-xs text-gray-400 font-medium mb-4">Upload a high-quality photo of the dish. Recommended size 800x600px.</p>
                         <label className="bg-gray-100 hover:bg-gray-200 px-6 py-2.5 rounded-xl text-sm font-bold text-gray-700 cursor-pointer transition-colors inline-block text-center">
                            {uploading ? 'Uploading...' : 'Browse Files'}
                            <input type="file" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                         </label>
                      </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Name</label>
                    <input 
                       type="text" 
                       required 
                       placeholder="e.g. Spicy Tikka Masala"
                       className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                       value={formData.name}
                       onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Price (₹)</label>
                    <input 
                       type="number" 
                       step="0.01" 
                       required 
                       placeholder="0.00"
                       className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                       value={formData.price}
                       onChange={(e) => setFormData({...formData, price: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                    />
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Category</label>
                      <select 
                          className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium appearance-none"
                          value={formData.category}
                          onChange={(e) => setFormData({...formData, category: e.target.value})}
                      >
                          {['Appetizers', 'Main Course', 'Breads', 'Desserts', 'Drinks', 'Veg', 'Non-Veg'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Spicy Level (0-3)</label>
                     <div className="flex gap-4 items-center h-14">
                        {[0, 1, 2, 3].map(level => (
                           <button
                              key={level}
                              type="button"
                              onClick={() => setFormData({...formData, spicyLevel: level})}
                              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                                 formData.spicyLevel === level 
                                 ? 'bg-orange-600 border-orange-600 text-white' 
                                 : 'border-gray-100 text-gray-300'
                              }`}
                           >
                              {level === 0 ? <Check className="w-4 h-4" /> : <Flame className="w-4 h-4 fill-current" />}
                           </button>
                        ))}
                     </div>
                  </div>
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1 uppercase tracking-tight">Description</label>
                  <textarea 
                      rows={3}
                      placeholder="Describe the flavors and ingredients..."
                      className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all font-medium"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
              </div>

              <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                 <input 
                   type="checkbox" 
                   id="isAvailable" 
                   className="w-5 h-5 accent-orange-600 rounded"
                   checked={formData.isAvailable}
                   onChange={(e) => setFormData({...formData, isAvailable: e.target.checked})}
                 />
                 <label htmlFor="isAvailable" className="font-bold text-gray-800 text-sm">Available for Ordering</label>
              </div>

              <div className="flex gap-4 pt-4">
                  <button type="button" onClick={onClose} className="flex-1 py-4 border-2 border-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-4 bg-orange-600 text-white rounded-2xl font-bold font-bold shadow-xl shadow-orange-100 hover:bg-orange-700 transition-all disabled:opacity-50"
                    disabled={uploading}
                  >
                      {item ? 'Save Changes' : 'Create Dish'}
                  </button>
              </div>
           </form>
        </div>
      </motion.div>
    </div>
  );
};

export default MenuForm;
