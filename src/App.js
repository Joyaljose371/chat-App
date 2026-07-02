import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { encrypt, decrypt } from './cryptoHelper';
// 1. IMPORT ONESIGNAL INSTEAD OF LOCAL FCM HOOKS
import OneSignal from 'react-onesignal';

// ⚠️ ONESIGNAL CONFIGURATION FROM YOUR KEYS
const ONESIGNAL_APP_ID = "68948654-35b0-462a-929c-e899458a127d";
const ONESIGNAL_SAFARI_ID = "web.onesignal.auto.251f0eae-dd1c-4527-b78a-dfbe622fe6a9";

function App() {
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [replyTo, setReplyTo] = useState(null); // Tracks the message being replied to
  const messagesEndRef = useRef(null);

  // Swipe tracking references
  const touchStartX = useRef(0);
  const activeSwipeId = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState({});

  // PERSISTENT IDENTITY: Unique ID for this browser/device
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

  // 2. REPLACED HOOK: INTEGRATED SYSTEM INITIALIZATION FOR ONESIGNAL
  useEffect(() => {
    const initOneSignal = async () => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          safari_web_id: ONESIGNAL_SAFARI_ID,
          allowLocalhostAsSecure: true, // Allows testing setups over localhost
          notifyButton: {
            enable: true, // Shows the visual subscription bell toggle on screen
            position:'bottom-left'
          },
        });
        console.log("OneSignal successfully initialized!");
      } catch (error) {
        console.error('An error occurred during OneSignal initialization:', error);
      }
    };

    initOneSignal();
  }, []);

  useEffect(() => {
    if (!joined) return;

    const q = query(collection(db, "chats", room, "messages"), orderBy("createdAt", "asc"));
    
    const unsub = onSnapshot(q, async (snap) => {
      const decodedMsgs = await Promise.all(snap.docs.map(async d => {
        const data = d.data();
        try {
          const content = await decrypt(data.payload, room);
          return { 
            id: d.id, 
            content, 
            senderId: data.senderId,
            createdAt: data.createdAt,
            replyToContent: data.replyToContent || null // Fallback if not a reply
          };
        } catch (e) {
          return { id: d.id, content: "🔒 Decryption Error", senderId: data.senderId };
        }
      }));

      // INTEGRATED FOREGROUND SYSTEM LOCAL NOTIFICATIONS
      if (snap.docChanges().length > 0) {
        const lastChange = snap.docChanges()[snap.docChanges().length - 1];
        if (lastChange.type === "added" && !snap.metadata.hasPendingWrites) {
          const newMsgData = lastChange.doc.data();
          if (newMsgData.senderId !== myId) {
            try {
              const clearText = await decrypt(newMsgData.payload, room);
              if (Notification.permission === "granted") {
                new Notification(`New Message in ${room}`, {
                  body: clearText,
                  icon: '/favicon.ico'
                });
              }
            } catch (err) {
              console.error("Failed to decrypt for notification", err);
            }
          }
        }
      }

      setMessages(decodedMsgs);
      scrollToBottom();
    });

    return () => unsub();
  }, [joined, room, myId]);

  // 3. UPDATED SENDING INTERFACE WITH AUTOMATIC BACKGROUND TRIGGER
  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const payload = await encrypt(text, room);
      
      const messageData = { 
        payload, 
        senderId: myId,
        createdAt: serverTimestamp() 
      };

      // If this is a reply, attach the plain-text snippet of the parent message
      if (replyTo) {
        messageData.replyToContent = replyTo.content;
      }

      // Step A: Write encrypted data bundle to Firestore
      await addDoc(collection(db, "chats", room, "messages"), { ...messageData });

      // Step B: Direct API call to alert users whose browsers are closed
      try {
        fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            // 🔒 SECURE: Pulled dynamically from your local system environment variables
            "Authorization": `Basic ${process.env.REACT_APP_ONESIGNAL_REST_KEY}`
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            included_segments: ["Total Subscriptions"], 
            headings: { "en": "🔒 Secure Chat Update" },
            contents: { "en": `A secure text transaction was added in room: ${room}` }
          })
        });
      } catch (pushError) {
        console.error("Background notify fetch failure:", pushError);
      }
      setText('');
      setReplyTo(null); // Reset reply state after sending
    } catch (error) {
      console.error("Encryption/Send Error:", error);
    }
  };

  // --- Native Touch Swipe Handlers ---
  const handleTouchStart = (e, msg) => {
    touchStartX.current = e.touches[0].clientX;
    activeSwipeId.current = msg.id;
  };

  const handleTouchMove = (e) => {
    if (!activeSwipeId.current) return;
    const currentX = e.touches[0].clientX;
    const diffX = currentX - touchStartX.current;

    // Swipe right to reply (WhatsApp style)
    if (diffX > 0 && diffX < 80) {
      setSwipeOffset({ [activeSwipeId.current]: diffX });
    }
  };

  const handleTouchEnd = (msg) => {
    const currentOffset = swipeOffset[msg.id] || 0;
    if (currentOffset > 50) {
      setReplyTo(msg); // Trigger the reply state if swiped far enough
    }
    setSwipeOffset({});
    activeSwipeId.current = null;
  };

  // --- Smart Date Header Formatter ---
  const renderDateHeader = (currentMsg, index) => {
    if (!currentMsg.createdAt) return null;
    const currentDate = currentMsg.createdAt.toDate();
    
    // If it's the first message, always show the date banner
    if (index === 0) return <div style={styles.dateHeader}>{formatDateLabel(currentDate)}</div>;

    const prevMsg = messages[index - 1];
    if (!prevMsg || !prevMsg.createdAt) return null;
    const prevDate = prevMsg.createdAt.toDate();

    // Check if the message belongs to a new calendar day
    if (currentDate.toDateString() !== prevDate.toDateString()) {
      return <div style={styles.dateHeader}>{formatDateLabel(currentDate)}</div>;
    }
    return null;
  };

  const formatDateLabel = (date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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
        {messages.map((m, index) => {
          const isMe = m.senderId === myId;
          const currentXOffset = swipeOffset[m.id] || 0;

          return (
            <React.Fragment key={m.id}>
              {/* Inject Smart Date Separation Bars */}
              {renderDateHeader(m, index)}

              <div 
                style={{ 
                  ...styles.bubbleWrapper, 
                  justifyContent: isMe ? 'flex-end' : 'flex-start',
                  transform: `translateX(${currentXOffset}px)`,
                  transition: currentXOffset === 0 ? 'transform 0.2s ease' : 'none'
                }}
                onTouchStart={(e) => handleTouchStart(e, m)}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd(m)}
              >
                <div style={{ 
                  ...styles.bubble, 
                  backgroundColor: isMe ? '#007aff' : '#ffffff', 
                  color: isMe ? '#fff' : '#000',
                  borderBottomRightRadius: isMe ? '4px' : '18px',
                  borderBottomLeftRadius: isMe ? '18px' : '4px',
                  boxShadow: isMe ? '0 1px 2px rgba(0,122,255,0.3)' : '0 1px 2px rgba(0,0,0,0.1)'
                }}>
                  {/* Display reference if it's a reply message */}
                  {m.replyToContent && (
                    <div style={{
                      ...styles.replyContextBox,
                      backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : '#f0f2f5',
                      borderLeftColor: isMe ? '#fff' : '#007aff',
                      color: isMe ? '#eee' : '#555'
                    }}>
                      {m.replyToContent}
                    </div>
                  )}

                  <div style={{ wordBreak: 'break-word' }}>{m.content}</div>
                  <span style={{ 
                    ...styles.timestamp, 
                    color: isMe ? 'rgba(255,255,255,0.7)' : '#888' 
                  }}>
                    {m.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply UI Action Indicator Bar above Footer */}
      {replyTo && (
        <div style={styles.replyBarContainer}>
          <div style={styles.replyIndicatorBox}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#007aff' }}>Replying to message</span>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.content}</p>
          </div>
          <button style={styles.cancelReplyBtn} onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

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
  dateHeader: { alignSelf: 'center', backgroundColor: '#e5e5ea', color: '#555', fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '10px', margin: '12px 0', textTransform: 'uppercase' },
  bubbleWrapper: { display: 'flex', width: '100%', marginBottom: '4px', userSelect: 'none' },
  bubble: { maxWidth: '80%', padding: '8px 14px', borderRadius: '18px', fontSize: '15px', display: 'flex', flexDirection: 'column' },
  replyContextBox: { padding: '6px 10px', borderRadius: '6px', borderLeft: '3px solid', fontSize: '13px', marginBottom: '6px', fontStyle: 'italic', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  timestamp: { fontSize: '10px', marginTop: '4px', alignSelf: 'flex-end' },
  
  replyBarContainer: { display: 'flex', padding: '8px 16px', backgroundColor: '#f0f2f5', borderTop: '1px solid #e5e5ea', alignItems: 'center', justifyContent: 'space-between' },
  replyIndicatorBox: { borderLeft: '3px solid #007aff', paddingLeft: '8px', overflow: 'hidden', flex: 1 },
  cancelReplyBtn: { background: 'none', border: 'none', color: '#8e8e93', fontSize: '16px', cursor: 'pointer', padding: '0 8px' },

  inputBar: { padding: '12px 16px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #eee' },
  textInput: { flex: 1, padding: '10px 16px', borderRadius: '20px', border: '1px solid #e5e5ea', outline: 'none', backgroundColor: '#f2f2f7', fontSize: '15px' },
  sendBtn: { background: 'none', border: 'none', color: '#007aff', cursor: 'pointer', padding: '4px' }
};

export default App;