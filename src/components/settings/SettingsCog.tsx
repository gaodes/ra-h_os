"use client";

import { User } from 'lucide-react';

interface SettingsCogProps {
  onClick: () => void;
}

export default function SettingsCog({ onClick }: SettingsCogProps) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        width: '40px',
        height: '40px',
        background: '#1a1a1a',
        border: 'none', /* Remove border for cleaner look */
        borderRadius: '50%', /* Make it circular like an avatar */
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
        zIndex: 100
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#232323';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#1a1a1a';
      }}
      title="User Settings"
    >
      <User 
        size={20} 
        color="#666" 
        strokeWidth={1.5}
      />
    </button>
  );
}
