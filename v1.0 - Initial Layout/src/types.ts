export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string; // Existing field
  imageUrl?: string; // New requested field
  isAvailable: boolean;
  spicyLevel?: number;
  createdAt?: any;
}

export interface Order {
  id: string;
  userId: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  }[];
  total: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'delivered' | 'cancelled' | 'Order Received' | 'Accepted' | 'Ready For Delivery' | 'Assigned To Delivery Partner' | 'Picked Up' | 'On The Way';
  createdAt: any;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  // Delivery extended fields
  orderType?: 'dine_in' | 'pickup' | 'delivery';
  latitude?: number;
  longitude?: number;
  landmark?: string;
  notes?: string;
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  deliveryPartnerPhone?: string;
  updatedAt?: any;
}

export interface DeliveryPartner {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  vehicleType: string;
  vehicleNumber: string;
  profilePhoto?: string;
  password?: string;
  active: boolean;
  createdAt: any;
}

export interface DeliveryAssignment {
  id: string;
  orderId: string;
  partnerId: string;
  status: 'assigned' | 'accepted' | 'picked_up' | 'on_the_way' | 'delivered' | 'cancelled';
  assignedAt: any;
  updatedAt?: any;
}

export interface DeliveryTracking {
  id: string;
  orderId: string;
  partnerId: string;
  latitude: number;
  longitude: number;
  updatedAt: any;
}

export interface DeliveryStatusLog {
  id: string;
  orderId: string;
  status: string;
  updatedAt: any;
  updatedBy: 'admin' | 'partner' | 'customer';
}

export interface Table {
  id: string;
  name: string;
  capacity: number;
  status: 'free' | 'booked' | 'occupied';
  createdAt?: any;
}

export interface Reservation {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed' | 'seated' | 'no-show';
  assignedTables?: string[]; // Array of table names or IDs
  createdAt: any;
  seenByGuest?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt: any;
}

export interface Feedback {
  id?: string;
  userId: string;
  orderId?: string;
  reservationId?: string;
  rating: number; // 1-5
  comment: string;
  createdAt: any;
}
