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

  // Auto-scroll to the latest message
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
        // Decrypt the message using the Room Code as the key
        const content = await decrypt(data.payload, room);
        return { 
          id: d.id, 
          content, 
          senderId: data.senderId,
          createdAt: data.createdAt 
        };
      }));
      setMessages(decodedMsgs);
      scrollToBottom();
    }, (err) => {
      console.error("Firestore Error:", err);
      alert("Make sure your Firestore Rules allow access!");
    });

    return () => unsub();
  }, [joined, room]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      // Encrypt before sending to Firebase
      const payload = await encrypt(text, room);
      const myId = window.navigator.userAgent.slice(0, 10); // Simple way to track 'Me' vs 'Them'

      await addDoc(collection(db, "chats", room, "messages"), { 
        payload, 
        senderId: myId,
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
        <h2 style={{ marginBottom: '10px' }}>Private Chat 🔐</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
          Enter a shared code to start an encrypted session.
        </p>
        <input 
          style={styles.loginInput}
          type="text" 
          placeholder="Room Secret (e.g. Joyal77)" 
          value={room}
          onChange={e => setRoom(e.target.value)} 
        />
        <button 
          style={styles.loginBtn}
          onClick={() => room.trim() && setJoined(true)}>
          Enter Secure Room
        </button>
      </div>
    </div>
  );

  // --- CHAT INTERFACE ---
  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <div style={styles.statusDot}></div>
        <div>
          <h4 style={{ margin: 0 }}>Room: {room}</h4>
          <span style={styles.encryptionBadge}>End-to-End Encrypted</span>
        </div>
      </header>
      
      <div style={styles.messageArea}>
        {messages.map((m) => {
          const isMe = m.senderId === window.navigator.userAgent.slice(0, 10);
          return (
            <div key={m.id} style={{ ...styles.bubbleWrapper, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ 
                ...styles.bubble, 
                backgroundColor: isMe ? '#007aff' : '#fff', 
                color: isMe ? '#fff' : '#000',
                borderBottomRightRadius: isMe ? '4px' : '18px',
                borderBottomLeftRadius: isMe ? '18px' : '4px'
              }}>
                {m.content}
                <span style={{ ...styles.timestamp, color: isMe ? '#e0e0e0' : '#888' }}>
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
        />
        <button type="submit" style={styles.sendBtn}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
  );
}

// --- STYLES ---
const styles = {
  loginContainer: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f2f5', fontFamily: 'sans-serif' },
  loginCard: { backgroundColor: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center', width: '320px' },
  loginInput: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box', marginBottom: '15px' },
  loginBtn: { width: '100%', padding: '12px', backgroundColor: '#007aff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' },
  
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '600px', margin: 'auto', backgroundColor: '#f5f5f5', fontFamily: 'sans-serif' },
  header: { padding: '15px 20px', backgroundColor: '#fff', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', sticky: 'top' },
  statusDot: { width: '10px', height: '10px', backgroundColor: '#4cd964', borderRadius: '50%', marginRight: '12px' },
  encryptionBadge: { fontSize: '10px', color: '#888', textTransform: 'uppercase' },
  
  messageArea: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' },
  bubbleWrapper: { display: 'flex', width: '100%' },
  bubble: { maxWidth: '75%', padding: '10px 15px', borderRadius: '18px', boxShadow: '0 1px 1px rgba(0,0,0,0.1)', fontSize: '15px', display: 'flex', flexDirection: 'column' },
  timestamp: { fontSize: '10px', marginTop: '4px', alignSelf: 'flex-end' },
  
  inputBar: { padding: '10px 15px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #ddd' },
  textInput: { flex: 1, padding: '12px 18px', borderRadius: '25px', border: '1px solid #ddd', outline: 'none', backgroundColor: '#f9f9f9' },
  sendBtn: { background: 'none', border: 'none', color: '#007aff', cursor: 'pointer' }
};

export default App;