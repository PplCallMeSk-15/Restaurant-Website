import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, updateDoc, doc, addDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { Order, DeliveryPartner } from '../../types';
import { 
  Users, ShoppingBag, Plus, Edit2, Trash2, CheckCircle2, XCircle, 
  Search, Loader2, MapPin, Phone, Mail, Navigation, Eye, UserX, UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import DeliveryMap from '../../components/DeliveryMap';
import { triggerOrderEmailForStatus } from '../../services/clientEmailTrigger';

export default function AdminDelivery() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'deliveries' | 'partners'>('deliveries');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Partner CRUD Modals
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<DeliveryPartner | null>(null);
  const [partnerToDelete, setPartnerToDelete] = useState<DeliveryPartner | null>(null);
  const [partnerForm, setPartnerForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    vehicleType: 'Motorcycle',
    vehicleNumber: '',
    profilePhoto: '',
    password: '',
    active: true
  });

  // Assign Partner Modal
  const [activeOrderForAssigning, setActiveOrderForAssigning] = useState<Order | null>(null);
  const [selectedOrderForTracking, setSelectedOrderForTracking] = useState<Order | null>(null);

  // Lock body scroll when tracking modal is open
  useEffect(() => {
    if (selectedOrderForTracking) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [selectedOrderForTracking]);

  const navigate = useNavigate();

  // Load orders & partners
  useEffect(() => {
    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
      const ordersData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Order[];
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to orders:', error);
      setLoading(false);
    });

    const unsubPartners = onSnapshot(query(collection(db, 'delivery_partners'), orderBy('createdAt', 'desc')), (snapshot) => {
      const partnersData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DeliveryPartner[];
      setPartners(partnersData);
    }, (error) => {
      console.error('Error listening to partners:', error);
    });

    return () => {
      unsubOrders();
      unsubPartners();
    };
  }, []);

  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerForm.fullName || !partnerForm.phone || !partnerForm.email || !partnerForm.password) {
      toast.error('Please fill out all mandatory fields');
      return;
    }

    try {
      if (editingPartner) {
        // Edit Partner
        await updateDoc(doc(db, 'delivery_partners', editingPartner.id), {
          ...partnerForm,
          updatedAt: serverTimestamp()
        });
        toast.success('Delivery partner updated successfully!');
      } else {
        // Add Partner
        await addDoc(collection(db, 'delivery_partners'), {
          ...partnerForm,
          createdAt: serverTimestamp()
        });
        toast.success('New delivery partner registered!');
      }
      setShowPartnerModal(false);
      setEditingPartner(null);
      resetPartnerForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed to process request');
    }
  };

  const deletePartner = (partner: DeliveryPartner) => {
    setPartnerToDelete(partner);
  };

  const confirmDeletePartner = async () => {
    if (!partnerToDelete) return;
    try {
      await deleteDoc(doc(db, 'delivery_partners', partnerToDelete.id));
      toast.success('Partner removed from roster');
      setPartnerToDelete(null);
    } catch (err: any) {
      toast.error('Failed to delete partner');
    }
  };

  const togglePartnerStatus = async (partner: DeliveryPartner) => {
    try {
      await updateDoc(doc(db, 'delivery_partners', partner.id), {
        active: !partner.active
      });
      toast.success(`Partner status set to ${!partner.active ? 'Active' : 'Disabled'}`);
    } catch (err) {
      toast.error('Failed to change partner status');
    }
  };

  const resetPartnerForm = () => {
    setPartnerForm({
      fullName: '',
      phone: '',
      email: '',
      vehicleType: 'Motorcycle',
      vehicleNumber: '',
      profilePhoto: '',
      password: '',
      active: true
    });
  };

  const openEditPartner = (partner: DeliveryPartner) => {
    setEditingPartner(partner);
    setPartnerForm({
      fullName: partner.fullName || '',
      phone: partner.phone || '',
      email: partner.email || '',
      vehicleType: partner.vehicleType || 'Motorcycle',
      vehicleNumber: partner.vehicleNumber || '',
      profilePhoto: partner.profilePhoto || '',
      password: partner.password || '',
      active: partner.active !== false
    });
    setShowPartnerModal(true);
  };

  // Assign partner action
  const assignOrderPartner = async (partner: DeliveryPartner) => {
    if (!activeOrderForAssigning) return;
    try {
      await updateDoc(doc(db, 'orders', activeOrderForAssigning.id), {
        status: 'Assigned To Delivery Partner',
        deliveryPartnerId: partner.id,
        deliveryPartnerName: partner.fullName,
        deliveryPartnerPhone: partner.phone,
        updatedAt: serverTimestamp()
      });

      // Write logs
      await addDoc(collection(db, 'delivery_status_logs'), {
        orderId: activeOrderForAssigning.id,
        status: 'Assigned To Delivery Partner',
        updatedBy: 'admin',
        updatedAt: serverTimestamp()
      });

      // Write relationship in delivery_assignments
      await addDoc(collection(db, 'delivery_assignments'), {
        orderId: activeOrderForAssigning.id,
        partnerId: partner.id,
        status: 'assigned',
        assignedAt: serverTimestamp()
      });

      toast.success(`Assigned successfully to ${partner.fullName}`);
      const assignedOrderId = activeOrderForAssigning.id;
      setActiveOrderForAssigning(null);

      // Trigger client-side assigned status email notification
      triggerOrderEmailForStatus(assignedOrderId, 'Assigned To Delivery Partner').catch(err =>
        console.warn('[Client Email Trigger] Failed to send order status email:', err)
      );
    } catch (err: any) {
      toast.error('Failed to assign partner');
    }
  };

  // Filter list
  const filteredOrders = orders.filter((o) => {
    // Only search/display deliveries
    const isDelivery = o.orderType === 'delivery';
    if (!isDelivery) return false;

    // Search query matches
    const searchMatch = 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerPhone.includes(searchQuery) ||
      (o.address && o.address.toLowerCase().includes(searchQuery.toLowerCase()));

    // Status Filter match
    const statusMatch = statusFilter === 'all' || o.status === statusFilter;

    return searchMatch && statusMatch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-800';
      case 'confirmed': return 'bg-purple-100 text-purple-800';
      case 'preparing': return 'bg-blue-100 text-blue-850';
      case 'Ready For Delivery': return 'bg-orange-100 text-orange-900 border border-orange-200 animate-pulse';
      case 'Assigned To Delivery Partner': return 'bg-indigo-100 text-indigo-850';
      case 'Picked Up': return 'bg-cyan-100 text-cyan-850';
      case 'On The Way': return 'bg-sky-100 text-sky-850';
      case 'delivered': return 'bg-emerald-100 text-emerald-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="pt-32 text-center text-gray-500">Loading Delivery center...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FBFBFA] pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 leading-none mb-2">Delivery Management</h1>
            <p className="text-gray-500">Track and assign restaurant food logistics in real-time.</p>
          </div>
          <div className="flex bg-white border border-gray-100 rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => setActiveTab('deliveries')}
              className={`px-5 py-3 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-2 ${
                activeTab === 'deliveries' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'text-gray-400 hover:text-orange-600'
              }`}
            >
              <ShoppingBag className="w-4 h-4" /> Deliveries ({orders.filter(o => o.orderType === 'delivery').length})
            </button>
            <button
              onClick={() => setActiveTab('partners')}
              className={`px-5 py-3 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-2 ${
                activeTab === 'partners' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'text-gray-400 hover:text-orange-600'
              }`}
            >
              <Users className="w-4 h-4" /> Fleet Roster ({partners.length})
            </button>
          </div>
        </div>

        {/* Dashboard Content */}
        {activeTab === 'deliveries' ? (
          <div className="space-y-8">
            {/* Top Stats Overview & Search */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Total Deliveries</p>
                  <h3 className="text-2xl font-black text-gray-900">{orders.filter((o) => o.orderType === 'delivery').length}</h3>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                  <Loader2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Pending Assignment</p>
                  <h3 className="text-2xl font-black text-gray-900">{orders.filter((o) => o.orderType === 'delivery' && o.status === 'Ready For Delivery').length}</h3>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-sky-50 text-sky-600 rounded-2xl">
                  <Navigation className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Active On The Way</p>
                  <h3 className="text-2xl font-black text-gray-900">{orders.filter((o) => o.orderType === 'delivery' && ['Assigned To Delivery Partner', 'Picked Up', 'On The Way'].includes(o.status)).length}</h3>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Fulfilled Today</p>
                  <h3 className="text-2xl font-black text-gray-900">{orders.filter((o) => o.orderType === 'delivery' && o.status === 'delivered').length}</h3>
                </div>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="w-full md:w-96 flex bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm items-center">
                <Search className="w-5 h-5 text-gray-400 ml-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Search by ID, name, mobile or address..."
                  className="w-full bg-transparent border-none text-sm px-3 focus:outline-none placeholder-gray-400 font-sans"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-2 overflow-x-auto w-full md:w-auto">
                {['all', 'pending', 'confirmed', 'preparing', 'Ready For Delivery', 'Assigned To Delivery Partner', 'On The Way', 'delivered'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all uppercase ${
                      statusFilter === s ? 'bg-orange-600 text-white shadow-md shadow-orange-100' : 'bg-white text-gray-400 border border-gray-50 hover:text-orange-600'
                    }`}
                  >
                    {s === 'Ready For Delivery' ? 'Ready✨' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders Table Grid */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#FAF9F5] text-[10px] text-gray-400 uppercase font-black tracking-widest">
                    <tr>
                      <th className="px-8 py-5">Order ID</th>
                      <th className="px-8 py-5">Recipient Details</th>
                      <th className="px-8 py-5">Delivery Landmark / Coordinates</th>
                      <th className="px-8 py-5">Fulfillment Status</th>
                      <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <AnimatePresence mode="popLayout">
                      {filteredOrders.map((order) => (
                        <motion.tr
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          key={order.id}
                          className="hover:bg-gray-50/20 transition-all font-sans"
                        >
                          <td className="px-8 py-6">
                            <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                              #{order.id.slice(-6).toUpperCase()}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-2 font-semibold">
                              {order.items.length} items â€¢ Total ₹{order.total.toFixed(2)}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <h4 className="font-bold text-gray-800 text-sm leading-snug">{order.customerName}</h4>
                            <div className="flex flex-col gap-1 mt-1 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" /> {order.customerPhone}</span>
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-orange-600 shrink-0" /> {order.address}</span>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-xs text-gray-500">
                            {order.landmark ? (
                              <div className="mb-1 font-semibold text-gray-650">Landmark: <span className="text-gray-900 font-bold">{order.landmark}</span></div>
                            ) : (
                              <span className="text-gray-400 font-medium">No landmark specified</span>
                            )}
                            <div className="font-mono text-[10px] text-gray-400 mt-1">
                              GPS: {order.latitude && order.longitude ? `${order.latitude.toFixed(4)}, ${order.longitude.toFixed(4)}` : 'No Coordinates Pin'}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-full tracking-tighter ${getStatusBadge(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex flex-col md:items-end gap-2 shrink-0">
                              <div className="flex gap-2">
                                {!order.deliveryPartnerId && ['pending', 'confirmed', 'preparing', 'Ready For Delivery'].includes(order.status) && (
                                  <button
                                    onClick={() => setActiveOrderForAssigning(order)}
                                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-orange-100 select-none cursor-pointer animate-pulse"
                                  >
                                    Assign Partner
                                  </button>
                                )}
                                {order.latitude && order.longitude && (
                                  <button
                                    onClick={() => setSelectedOrderForTracking(order)}
                                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> Track Coords
                                  </button>
                                )}
                              </div>

                              {order.deliveryPartnerName ? (
                                <div className="text-left md:text-right">
                                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-700 block">Assigned Messenger:</span>
                                  <span className="text-xs font-bold text-gray-900">{order.deliveryPartnerName}</span>
                                </div>
                              ) : (
                                ['pending', 'confirmed', 'preparing', 'Ready For Delivery'].includes(order.status) ? (
                                  <span className="text-[10px] text-gray-400 italic">Waiting for assignment</span>
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic">No partner assigned</span>
                                )
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-16 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                          No delivery orders found matching filter criteria
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Fleet Roster Section */}
            <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-gray-150">
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-800">Add Registered Deliverers</h3>
                <p className="text-xs text-gray-500">Provide login logins to activate their active shift dashboards.</p>
              </div>
              <button
                onClick={() => {
                  resetPartnerForm();
                  setEditingPartner(null);
                  setShowPartnerModal(true);
                }}
                className="bg-gray-900 hover:bg-orange-600 text-white font-black text-xs px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Partner
              </button>
            </div>

            {/* Roster Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {partners.map((partner) => (
                <div
                  key={partner.id}
                  className={`bg-white rounded-[2rem] p-6 border transition-all shadow-sm ${
                    partner.active ? 'border-gray-100' : 'border-red-150 bg-red-50/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-gray-600 border border-gray-200 uppercase">
                        {partner.fullName.slice(0, 2)}
                      </div>
                      <div className="text-left">
                        <h4 className="font-extrabold text-sm text-gray-900 leading-tight">{partner.fullName}</h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className={`text-[8px] tracking-wide font-black uppercase px-2 py-0.5 rounded-full inline-block ${
                            partner.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {partner.active ? 'Active Shift' : 'Off-duty'}
                          </span>
                          {partner.active && (() => {
                            const activeOrders = orders.filter(o => o.deliveryPartnerId === partner.id && !['delivered', 'cancelled'].includes(o.status));
                            if (activeOrders.length > 0) {
                              return (
                                <span className={`text-[8px] tracking-wide font-black uppercase px-2 py-0.5 rounded-full inline-block bg-orange-100 text-orange-850`}>
                                  Busy: #{activeOrders[0].id.slice(-6).toUpperCase()}
                                </span>
                              );
                            } else {
                              return (
                                <span className="text-[8px] tracking-wide font-black uppercase px-2 py-0.5 rounded-full inline-block bg-sky-100 text-sky-850">
                                  Available
                                </span>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditPartner(partner)}
                        className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                        id={`edit-partner-btn-${partner.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deletePartner(partner)}
                        className="p-2 text-gray-400 hover:text-red-650 transition-colors"
                        id={`delete-partner-btn-${partner.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-gray-50 pt-4 text-xs text-gray-600">
                    <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400" /> {partner.phone}</div>
                    <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-gray-400" /> {partner.email}</div>
                    <div className="flex items-center gap-2 border-t border-gray-50 pt-2 font-medium">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Vehicle: </span>
                      <span className="text-gray-800">{partner.vehicleType} {"\u2022"} {partner.vehicleNumber || 'No Plate'}</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-gray-50 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">Interactive Lock:</span>
                    <button
                      onClick={() => togglePartnerStatus(partner)}
                      className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all ${
                        partner.active 
                          ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white' 
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                      }`}
                    >
                      {partner.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {partner.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
              {partners.length === 0 && (
                <div className="col-span-1 md:col-span-3 text-center py-16 bg-white rounded-[2rem] border border-gray-100 text-gray-500 text-xs font-bold uppercase tracking-widest">
                  No partners currently available
                </div>
              )}
            </div>
          </div>
        )}

        {/* Partner Detail & Setup Form Modal */}
        <AnimatePresence>
          {showPartnerModal && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
              >
                <div className="p-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-900">{editingPartner ? 'Edit Delivery Partner' : 'Create Delivery Partner'}</h3>
                  <button 
                    onClick={() => setShowPartnerModal(false)}
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handlePartnerSubmit} className="p-8 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
                      value={partnerForm.fullName}
                      onChange={(e) => setPartnerForm({ ...partnerForm, fullName: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">Mobile Number</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
                        value={partnerForm.phone}
                        onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">Email (Username)</label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. ramesh@spice.com"
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
                        value={partnerForm.email}
                        onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">Vehicle Type</label>
                      <select
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2"
                        value={partnerForm.vehicleType}
                        onChange={(e) => setPartnerForm({ ...partnerForm, vehicleType: e.target.value })}
                      >
                        {['Motorcycle', 'Scooter', 'Bicycle', 'Electric Vehicle'].map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">Vehicle Number</label>
                      <input
                        type="text"
                        placeholder="e.g. KA-01-EF-4567"
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2"
                        value={partnerForm.vehicleNumber}
                        onChange={(e) => setPartnerForm({ ...partnerForm, vehicleNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600">Login Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Minimum 6 characters"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
                      value={partnerForm.password}
                      onChange={(e) => setPartnerForm({ ...partnerForm, password: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="partnerActive"
                      checked={partnerForm.active}
                      onChange={(e) => setPartnerForm({ ...partnerForm, active: e.target.checked })}
                    />
                    <label htmlFor="partnerActive" className="text-xs font-bold text-gray-700">Approve partner active status now</label>
                  </div>

                  <div className="flex gap-3 pt-6">
                    <button
                      type="button"
                      onClick={() => setShowPartnerModal(false)}
                      className="flex-1 py-3 text-sm font-bold bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 text-center"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 text-sm font-bold bg-orange-600 text-white rounded-xl hover:bg-orange-700 shadow-lg text-center"
                    >
                      Save Partner
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Assign Partner Selection Modal */}
        <AnimatePresence>
          {activeOrderForAssigning && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[500px]"
              >
                <div className="p-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0">
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-gray-900">Select Messenger</h3>
                    <p className="text-[10px] text-gray-500">Order #{activeOrderForAssigning.id.slice(-6).toUpperCase()}</p>
                  </div>
                  <button 
                    onClick={() => setActiveOrderForAssigning(null)}
                    className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-400"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-grow overflow-y-auto p-6 divide-y divide-gray-105">
                  {partners.filter(p => p.active !== false).length > 0 ? (
                    partners.filter(p => p.active !== false).map((p) => {
                      const activeOrders = orders.filter(o => o.deliveryPartnerId === p.id && !['delivered', 'cancelled'].includes(o.status));
                      const isBusy = activeOrders.length > 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            if (isBusy) {
                              toast.error(`${p.fullName} is busy with another order and cannot accept new tasks.`);
                              return;
                            }
                            assignOrderPartner(p);
                          }}
                          className={`w-full py-4 text-left px-3 rounded-2xl transition-all flex items-center justify-between group ${
                            isBusy
                              ? 'bg-red-50/10 cursor-not-allowed border border-dashed border-red-200/50 opacity-65'
                              : 'hover:bg-orange-50/40 cursor-pointer'
                          }`}
                        >
                          <div className="text-left">
                            <div className="flex items-center gap-1.5">
                              <h4 className={`font-extrabold text-sm transition-colors ${isBusy ? 'text-gray-400' : 'text-gray-900 group-hover:text-orange-600'}`}>{p.fullName}</h4>
                              {isBusy ? (
                                <span className="bg-red-100 text-red-800 text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                                  Busy
                                </span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                                  Free
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{p.vehicleType} {"\u2022"} {p.vehicleNumber}</p>
                            {isBusy && (
                              <p className="text-[9px] text-red-600 font-black tracking-wide uppercase mt-1">
                                Pending Order #{activeOrders[0].id.slice(-6).toUpperCase()} ({activeOrders[0].status})
                              </p>
                            )}
                          </div>
                          {isBusy ? (
                            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-wide">
                      No online delivery partners. Activate off-duty partners to proceed.
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Admin Live tracking coordinates modal */}
        <AnimatePresence>
          {selectedOrderForTracking && (
            <div 
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
              onWheel={(e) => e.stopPropagation()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2.5rem] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col"
              >
                <div className="p-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0 text-left">
                  <div className="text-left">
                    <h3 className="text-xl font-bold text-gray-950 flex items-center gap-2">
                      <Navigation className="w-5 h-5 text-orange-600 animate-pulse fill-current" /> Admin Dispatch Tracking
                    </h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                      Order Reference: #{selectedOrderForTracking.id.toUpperCase()} • Client: {selectedOrderForTracking.customerName}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSelectedOrderForTracking(null)}
                    className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-450 cursor-pointer"
                  >
                    <XCircle className="w-5.5 h-5.5" />
                  </button>
                </div>

                <div className="p-6 bg-white space-y-4">
                  <div className="h-[400px] border border-gray-150 rounded-[2rem] overflow-hidden">
                    <DeliveryMap
                      mode="track"
                      latitude={selectedOrderForTracking.latitude}
                      longitude={selectedOrderForTracking.longitude}
                      partnerLatitude={selectedOrderForTracking.partnerLatitude}
                      partnerLongitude={selectedOrderForTracking.partnerLongitude}
                      height="100%"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-5 rounded-2xl border border-gray-100 text-xs text-left">
                    <div className="text-left space-y-1">
                      <div className="text-[9px] uppercase font-black text-gray-400">Target Address Destination</div>
                      <div className="font-bold text-gray-900 leading-snug">{selectedOrderForTracking.address}</div>
                      {selectedOrderForTracking.landmark && (
                        <div className="text-gray-500 mt-1">Landmark: <span className="font-bold text-gray-950">{selectedOrderForTracking.landmark}</span></div>
                      )}
                    </div>
                    <div className="text-left space-y-1 border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-5">
                      <div className="text-[9px] uppercase font-black text-gray-400">Active Courier Operations</div>
                      {selectedOrderForTracking.deliveryPartnerName ? (
                        <div className="space-y-1">
                          <div>Courier: <span className="font-bold text-gray-950">{selectedOrderForTracking.deliveryPartnerName}</span></div>
                          <div>Phone: <span className="font-bold text-gray-950">{selectedOrderForTracking.deliveryPartnerPhone}</span></div>
                          <div>Status: <span className="bg-indigo-100 text-indigo-850 px-2.5 py-0.5 rounded-full font-black uppercase text-[9px] tracking-tighter">{selectedOrderForTracking.status}</span></div>
                        </div>
                      ) : (
                        <div className="text-gray-400 italic">No delivery partner assigned to this order yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
          
          {partnerToDelete && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl p-6"
                id="delete-partner-modal"
              >
                <div className="text-center py-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600 mb-4">
                    <Trash2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Remove Delivery Partner</h3>
                  <p className="text-sm text-gray-500 px-2">
                    Are you sure you want to remove <span className="font-semibold text-gray-800">{partnerToDelete.fullName}</span>? This action is permanent and cannot be undone.
                  </p>
                </div>
                
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setPartnerToDelete(null)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                    id="cancel-delete-partner-btn"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDeletePartner}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                    id="confirm-delete-partner-btn"
                  >
                    Remove
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
