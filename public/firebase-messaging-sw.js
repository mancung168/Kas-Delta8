importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDB1P5ZyVMSgTUVTS11CJp6sYAmYg3Ync0",
  projectId: "gen-lang-client-0774260930",
  messagingSenderId: "564518867457",
  appId: "1:564518867457:web:b4a65b34d961e6398ca600"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
});
