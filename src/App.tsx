/// <reference types="chrome" />

import { useState, useEffect } from 'react';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }, (response) => {
      if (response?.signedIn) {
        setIsSignedIn(true);
      }
    });
  }, []);

  const handleSignIn = () => {
    chrome.runtime.sendMessage({ type: 'AUTH_REQUEST', payload: { type: 'LOGIN' } }, (response) => {
      if (response?.success) {
        setIsSignedIn(true);
      }
    });
  };

  return (
    <div className="popup-container">
      <div className="logo">
        <h1>Pramana</h1>
        <p>Capture. Edit. Share.</p>
      </div>
      {!isSignedIn && (
        <button className="btn-primary" onClick={handleSignIn}>
          Sign in with Google
        </button>
      )}
    </div>
  );
}

export default App;
