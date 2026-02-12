import React from 'react';
import type { Metadata } from 'next'


export const metadata: Metadata = {
  title: 'Test Site | PiPilot',
}

export default function TestSitePage() {
  const iframeSrc = '/testsite/index.html';

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <iframe
        src={iframeSrc}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Uploaded Test Site"
      />
    </div>
  );
}