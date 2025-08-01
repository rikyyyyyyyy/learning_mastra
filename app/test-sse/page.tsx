'use client';

import { useEffect, useState } from 'react';

export default function TestSSE() {
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState('Not connected');
  
  useEffect(() => {
    const eventSource = new EventSource('/api/test-sse');
    
    eventSource.onopen = () => {
      setStatus('Connected');
      console.log('✅ SSE Connected');
    };
    
    eventSource.onmessage = (event) => {
      console.log('📨 Message:', event.data);
      setMessages(prev => [...prev, event.data]);
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ SSE Error:', error);
      setStatus('Error');
    };
    
    return () => {
      eventSource.close();
    };
  }, []);
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">SSE Test Page</h1>
      <p className="mb-4">Status: {status}</p>
      <div className="border p-4 rounded">
        <h2 className="font-bold mb-2">Messages:</h2>
        {messages.map((msg, index) => (
          <pre key={index} className="text-sm mb-1">{msg}</pre>
        ))}
      </div>
    </div>
  );
}