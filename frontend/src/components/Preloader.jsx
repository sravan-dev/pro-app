import React from 'react';

// Full-screen brand preloader: four dots growing in turn, "Loading to success".
// Styles live in index.html (so the same preloader shows before the app's JS
// loads); keep this markup in step with the copy there.
export default function Preloader() {
  return (
    <div className="preloader" role="status" aria-live="polite">
      <div className="preloader-dots" aria-hidden="true"><i /><i /><i /><i /></div>
      <p className="preloader-text">Loading to success</p>
    </div>
  );
}
