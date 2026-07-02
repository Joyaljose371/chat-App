// Import the Firebase scripts inside the service worker environment
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase inside the service worker with your real keys
firebase.initializeApp({
  apiKey: "AIzaSyBtwNjwmynm6yYOUWIcMAvVGQr-rboVtrA",
  authDomain: "private-chat-99add.firebaseapp.com",
  projectId: "private-chat-99add",
  storageBucket: "private-chat-99add.firebasestorage.app",
  messagingSenderId: "729345046498",
  appId: "1:729345046498:web:1c980e347d4971f4d3abbb"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || "New Message";
  const notificationOptions = {
    body: payload.notification?.body || "You have an encrypted chat message.",
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});