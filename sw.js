self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting(); // Force the waiting service worker to become active
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
});

self.addEventListener('fetch', (event) => {
  console.log(`Fetching: ${event.request.url}`);
});
