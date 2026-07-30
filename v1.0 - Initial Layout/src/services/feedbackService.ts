import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface Feedback {
  id?: string;
  userId: string;
  orderId?: string;
  reservationId?: string;
  rating: number; // 1-5
  comment: string;
  createdAt: any;
}

export const submitFeedback = async (feedback: Omit<Feedback, 'id' | 'createdAt'>) => {
  try {
    const feedbackRef = collection(db, 'feedback');
    
    // Remove undefined values as Firestore doesn't accept them
    const cleanFeedback = Object.fromEntries(
      Object.entries(feedback).filter(([_, v]) => v !== undefined)
    );

    await addDoc(feedbackRef, {
      ...cleanFeedback,
      createdAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error submitting feedback:', error);
    throw error;
  }
};

export const subscribeToSatisfactionRate = (callback: (rate: number) => void) => {
  const feedbackRef = collection(db, 'feedback');
  
  return onSnapshot(feedbackRef, (snapshot) => {
    if (snapshot.empty) {
      callback(0);
      return;
    }

    const totalRating = snapshot.docs.reduce((acc, doc) => {
      const data = doc.data();
      return acc + (data.rating || 0);
    }, 0);

    const averageRating = totalRating / snapshot.size;
    // Convert 1-5 scale to 0-100 percentage
    const percentage = Math.round((averageRating / 5) * 100);
    callback(percentage);
  });
};
