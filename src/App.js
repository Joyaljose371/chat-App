import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { encrypt, decrypt } from './cryptoHelper';

function App() {
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  // 1. PERSISTENT IDENTITY: Generates a unique ID for this browser/device
  const [myId] = useState(() => {
    const savedId = localStorage.getItem('chat_user_id');
    if (savedId) return savedId;
    const newId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chat_user_id', newId);
    return newId;
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!joined) return;

    // Listen to messages in the specific room
    const q = query(collection(db, "chats", room, "messages"), orderBy("createdAt", "asc"));
    
    const unsub = onSnapshot(q, async (snap) => {
      const decodedMsgs = await Promise.all(snap.docs.map(async d => {
        const data = d.data();
        try {
          // Decrypt using the Room Code as the secret key
          const content = await decrypt(data.payload, room);
          return { 
            id: d.id, 
            content, 
            senderId: data.senderId,
            createdAt: data.createdAt 
          };
        } catch (e) {
          return { id: d.id, content: "🔒 Decryption Error", senderId: data.senderId };
        }
      }));
      setMessages(decodedMsgs);
      scrollToBottom();
    });

    return () => unsub();
  }, [joined, room]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const payload = await encrypt(text, room);
      await addDoc(collection(db, "chats", room, "messages"), { 
        payload, 
        senderId: myId, // Attach your unique ID
        createdAt: serverTimestamp() 
      });
      setText('');
    } catch (error) {
      console.error("Encryption/Send Error:", error);
    }
  };

  // --- LOGIN SCREEN ---
  if (!joined) return (
    <div style={styles.loginContainer}>
      <div style={styles.loginCard}>
        <h2 style={{ marginBottom: '10px' }}>Secure Chat 🔐</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
          Messages are encrypted locally before reaching the cloud.
        </p>
        <input 
          style={styles.loginInput}
          type="text" 
          placeholder="Enter Room Code (e.g. Kerala2026)" 
          value={room}
          onChange={e => setRoom(e.target.value)} 
        />
        <button 
          style={styles.loginBtn}
          onClick={() => room.trim() && setJoined(true)}>
          Join Secure Session
        </button>
      </div>
    </div>
  );

  // --- CHAT INTERFACE ---
  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <div style={styles.statusDot}></div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '15px' }}>Room: {room}</h4>
          <span style={styles.encryptionBadge}>End-to-End Encrypted</span>
        </div>
        <button onClick={() => setJoined(false)} style={styles.exitBtn}>Exit</button>
      </header>
      
      <div style={styles.messageArea}>
        {messages.map((m) => {
          // Identify if the message belongs to THIS device
          const isMe = m.senderId === myId;
          return (
            <div key={m.id} style={{ 
              ...styles.bubbleWrapper, 
              justifyContent: isMe ? 'flex-end' : 'flex-start' 
            }}>
              <div style={{ 
                ...styles.bubble, 
                backgroundColor: isMe ? '#007aff' : '#ffffff', 
                color: isMe ? '#fff' : '#000',
                borderBottomRightRadius: isMe ? '4px' : '18px',
                borderBottomLeftRadius: isMe ? '18px' : '4px',
                boxShadow: isMe ? '0 1px 2px rgba(0,122,255,0.3)' : '0 1px 2px rgba(0,0,0,0.1)'
              }}>
                <div style={{ wordBreak: 'break-word' }}>{m.content}</div>
                <span style={{ 
                  ...styles.timestamp, 
                  color: isMe ? 'rgba(255,255,255,0.7)' : '#888' 
                }}>
                  {m.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} style={styles.inputBar}>
        <input 
          style={styles.textInput}
          value={text} 
          onChange={e => setText(e.target.value)} 
          placeholder="Message..." 
          autoFocus
        />
        <button type="submit" style={styles.sendBtn}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  );
}

// --- STYLES ---
const styles = {
  loginContainer: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f2f5', fontFamily: '-apple-system, sans-serif' },
  loginCard: { backgroundColor: '#fff', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', textAlign: 'center', width: '340px' },
  loginInput: { width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #ddd', boxSizing: 'border-box', marginBottom: '15px', fontSize: '16px', outline: 'none' },
  loginBtn: { width: '100%', padding: '14px', backgroundColor: '#007aff', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '16px' },
  
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '500px', margin: 'auto', backgroundColor: '#f8f9fa', borderLeft: '1px solid #eee', borderRight: '1px solid #eee' },
  header: { padding: '12px 20px', backgroundColor: '#ffffffcc', backdropFilter: 'blur(10px)', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 },
  statusDot: { width: '8px', height: '8px', backgroundColor: '#34c759', borderRadius: '50%', marginRight: '12px' },
  encryptionBadge: { fontSize: '9px', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.5px' },
  exitBtn: { background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', fontSize: '14px' },
  
  messageArea: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px' },
  bubbleWrapper: { display: 'flex', width: '100%', marginBottom: '4px' },
  bubble: { maxWidth: '80%', padding: '8px 14px', borderRadius: '18px', fontSize: '15px', display: 'flex', flexDirection: 'column' },
  timestamp: { fontSize: '10px', marginTop: '4px', alignSelf: 'flex-end' },
  
  inputBar: { padding: '12px 16px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #eee' },
  textInput: { flex: 1, padding: '10px 16px', borderRadius: '20px', border: '1px solid #e5e5ea', outline: 'none', backgroundColor: '#f2f2f7', fontSize: '15px' },
  sendBtn: { background: 'none', border: 'none', color: '#007aff', cursor: 'pointer', padding: '4px' }
};

export default App;