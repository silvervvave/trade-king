// This script should be included before other client scripts that use sockets.

const socket = io();

socket.on('connect', () => {
    console.log('서버에 연결되었습니다.');
    // updateConnectionStatus is defined in utils.js, which should be loaded before this script.
    if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus(true);
    }
});

socket.on('disconnect', () => {
    console.log('서버 연결이 끊어졌습니다.');
    if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus(false);
    }
    // Optional: alert the user. This might be too intrusive for a shared script.
    // I will leave the alert in admin-client.js for now.
});

// The 'socket' constant is now globally available to other scripts loaded after this one.