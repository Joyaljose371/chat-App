import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { encrypt, decrypt } from './cryptoHelper';

function App() {
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!joined) return;
    const q = query(collection(db, "chats", room, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      const decodedMsgs = await Promise.all(snap.docs.map(async d => ({
        id: d.id,
        content: await decrypt(d.data().payload, room),
        ...d.data()
      })));
      setMessages(decodedMsgs);
    });
    return () => unsub();
  }, [joined, room]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text) return;
    const payload = await encrypt(text, room);
    await addDoc(collection(db, "chats", room, "messages"), { payload, createdAt: serverTimestamp() });
    setText('');
  };

  if (!joined) return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h2>Enter Private Room Code</h2>
      <input type="text" placeholder="e.g. 123456" onChange={e => setRoom(e.target.value)} />
      <button onClick={() => setJoined(true)}>Join Chat</button>
    </div>
  );

  return (
    <div style={{ maxWidth: '400px', margin: 'auto', padding: '20px' }}>
      <h3>Room: {room}</h3>
      <div style={{ height: '300px', overflowY: 'scroll', border: '1px solid #ccc', marginBottom: '10px' }}>
        {messages.map(m => <div key={m.id} style={{ padding: '5px' }}>{m.content}</div>)}
      </div>
      <form onSubmit={handleSend}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Message... 😊" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;