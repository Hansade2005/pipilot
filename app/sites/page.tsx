import React from 'react';
import BuiltOnBadge from '@/components/built-on-badge'
import type { Metadata } from 'next'


export const metadata: Metadata = {
  title: 'Sites | PiPilot',
}

export default function SitesPage() {
  // This page will be used to display hosted sites
  // The actual site loading is handled by the dynamic route [...path]
  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1 style={{ color: '#333', marginBottom: '10px' }}>Hosted Site</h1>
        <p style={{ color: '#666' }}>Loading your hosted website...</p>
      </div>
      {/* Built on badge */}
      <BuiltOnBadge href="https://pipilot.dev" />
    </div>
  );
}