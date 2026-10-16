import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkOrder() {
  const docRef = doc(db, 'orders', '2414'); // Use a known order ID
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    console.log('Order Data:', JSON.stringify(snap.data(), null, 2));
  } else {
    console.log('Order not found');
  }
}

checkOrder();
