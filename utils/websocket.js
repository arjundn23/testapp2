import { WebSocketServer } from 'ws';

let wss;

export const initWebSocket = (server) => {
  wss = new WebSocketServer({ server });
  console.log('WebSocket Server Initialized');

  wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });
};

export const getWSS = () => wss;

// Store active upload connections
const uploadConnections = new Map();

export const storeUploadConnection = (uploadId, ws) => {
  console.log('Storing upload connection for ID:', uploadId);
  uploadConnections.set(uploadId, ws);
};

export const removeUploadConnection = (uploadId) => {
  console.log('Removing upload connection for ID:', uploadId);
  uploadConnections.delete(uploadId);
};

export const sendUploadProgress = (uploadId, progress) => {
  const ws = uploadConnections.get(uploadId);
  console.log(`Sending progress ${progress}% for upload ID:`, uploadId);
  if (ws && ws.readyState === 1) { // 1 = OPEN
    ws.send(JSON.stringify({ type: 'progress', progress }));
  } else {
    console.log('WebSocket not ready or not found for upload ID:', uploadId);
  }
};

export const sendUploadComplete = (uploadId, data) => {
  const ws = uploadConnections.get(uploadId);
  console.log('Sending upload complete for ID:', uploadId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'complete', data }));
    removeUploadConnection(uploadId);
  } else {
    console.log('WebSocket not ready or not found for upload ID:', uploadId);
  }
};

export const sendUploadError = (uploadId, error) => {
  const ws = uploadConnections.get(uploadId);
  console.log('Sending upload error for ID:', uploadId, 'Error:', error);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'error', error }));
    removeUploadConnection(uploadId);
  } else {
    console.log('WebSocket not ready or not found for upload ID:', uploadId);
  }
};
