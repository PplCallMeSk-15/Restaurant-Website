import React from 'react';
import { MenuItem } from '../../types';
import { Edit2, Trash2 } from 'lucide-react';

interface MenuListProps {
  items: MenuItem[];
  onEdit: (item: MenuItem) => void;
  onDelete: (id: string) => void;
}

const MenuList: React.FC<MenuListProps> = ({ items, onEdit, onDelete }) => {
  return (
    <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
            <tr>
              <th className="px-8 py-5">Item</th>
              <th className="px-8 py-5">Category</th>
              <th className="px-8 py-5">Price</th>
              <th className="px-8 py-5">Status</th>
              <th className="px-8 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <tr key={item.id} className="group hover:bg-orange-50/20 transition-colors">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <img 
                      src={item.imageUrl || item.image} 
                      className="w-14 h-14 rounded-xl object-cover shadow-sm bg-gray-50" 
                      referrerPolicy="no-referrer" 
                      alt={item.name}
                      loading="lazy"
                    />
                    <div>
                      <p className="font-bold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400 line-clamp-1">{item.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className="text-xs font-bold bg-gray-100 px-3 py-1 rounded-full text-gray-600 uppercase tracking-tight">
                    {item.category}
                  </span>
                </td>
                <td className="px-8 py-6 font-bold text-gray-900 font-mono">
                  ₹{(item.price || 0).toFixed(2)}
                </td>
                <td className="px-8 py-6">
                  <div className={`flex items-center gap-2 text-xs font-bold ${item.isAvailable ? 'text-green-600' : 'text-red-400'}`}>
                    <div className={`w-2 h-2 rounded-full ${item.isAvailable ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`} />
                    {item.isAvailable ? 'AVAILABLE' : 'HIDDEN'}
                  </div>
                </td>
                <td className="px-8 py-6 text-right space-x-2">
                  <button 
                    onClick={() => onEdit(item)} 
                    className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-orange-600 hover:border-orange-200 transition-all shadow-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => onDelete(item.id)} 
                    className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center text-gray-400 font-medium">
                  No menu items found. Start by adding your first dish!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MenuList;
